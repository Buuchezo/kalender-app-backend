import { Request, Response, NextFunction } from "express";
import { parseISO, format } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";

function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export async function bookAppointmentMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { eventData } = req.body;

    if (!eventData || !eventData.start || !eventData.end) {
      return res.status(400).json({ message: "Missing required event data." });
    }

    const formattedStart = normalizeToScheduleXFormat(eventData.start);
    const formattedEnd = normalizeToScheduleXFormat(eventData.end);

    const [existingAppointments, workers] = await Promise.all([
      AppointmentModel.find({
        start: formattedStart,
        end: formattedEnd,
        title: { $regex: /^Booked Appointment/ },
      }),
      UserModel.find({ role: "worker" }),
    ]);

    const user =
      eventData.clientId && typeof eventData.clientId === "string"
        ? await UserModel.findById(eventData.clientId)
        : null;

    // Determine a free worker who is not yet assigned to this time
    const usedWorkerIds = existingAppointments.map((a) => a.ownerId);
    const freeWorker = workers.find((w) => !usedWorkerIds.includes(w.id));

    if (!freeWorker) {
      // No worker available — delete available slot
      await AppointmentModel.deleteOne({
        title: "Available Slot",
        start: formattedStart,
        end: formattedEnd,
        calendarId: "available",
      });

      return res
        .status(409)
        .json({ message: "No available workers for this time slot." });
    }

    // Decrement remaining capacity atomically
    const updatedSlot = await AppointmentModel.findOneAndUpdate(
      {
        title: "Available Slot",
        start: formattedStart,
        end: formattedEnd,
        calendarId: "available",
        remainingCapacity: { $gt: 0 },
      },
      {
        $inc: { remainingCapacity: -1 },
      },
      { new: true }
    );

    if (!updatedSlot) {
      return res
        .status(404)
        .json({ message: "Matching available slot not found." });
    }

    // Create the booked appointment separately
    const newAppointment = await AppointmentModel.create({
      title: `Booked Appointment with ${freeWorker.firstName}`,
      description: eventData.description || "",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      ownerId: freeWorker.id,
      clientId: eventData.clientId ?? `guest-${Date.now()}`,
      clientName: eventData.clientName ?? user?.firstName ?? "Guest",
    });

    // If capacity is 0 after update, delete the visible available slot
    if (
      updatedSlot?.remainingCapacity !== undefined &&
      updatedSlot.remainingCapacity <= 0
    ) {
      await AppointmentModel.deleteOne({ _id: updatedSlot._id });
    }

    req.body.updatedAppointment = newAppointment;
    next();
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
