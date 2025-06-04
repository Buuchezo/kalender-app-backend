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

    const [workers, slot] = await Promise.all([
      UserModel.find({ role: "worker" }),
      AppointmentModel.findOne({
        start: formattedStart,
        end: formattedEnd,
        calendarId: "available",
      }),
    ]);

    if (!slot) {
      return res.status(404).json({ message: "No available slot found." });
    }

    if (slot.remainingCapacity === undefined) {
      slot.remainingCapacity = workers.length;
    }

    // Find booked appointments for that time
    const overlappingBooked = await AppointmentModel.find({
      start: formattedStart,
      end: formattedEnd,
      title: { $regex: "^Booked Appointment" },
    });

    const bookedWorkerIds = overlappingBooked.map((e) => e.ownerId);
    const freeWorker = workers.find(
      (w) => !bookedWorkerIds.includes(w.id || w._id.toString())
    );

    if (!freeWorker) {
      return res.status(409).json({ message: "No available workers left." });
    }

    // Create a new Booked Appointment (this is *in addition* to the slot)
    const booked = await AppointmentModel.create({
      title: `Booked Appointment with ${freeWorker.firstName}`,
      description: eventData.description || "",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      ownerId: freeWorker.id || freeWorker._id,
      clientId: eventData.clientId ?? `guest-${Date.now()}`,
      clientName: eventData.clientName ?? "Guest",
    });

    // Decrease remainingCapacity
    slot.remainingCapacity -= 1;

    if (slot.remainingCapacity <= 0) {
      await AppointmentModel.deleteOne({ _id: slot._id });
    } else {
      await slot.save();
    }

    req.body.updatedAppointment = booked;
    next();
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
