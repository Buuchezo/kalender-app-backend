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

    // Find the single available slot for this time block
    const slot = await AppointmentModel.findOne({
      title: "Available Slot",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "available",
    });

    if (!slot) {
      return res.status(404).json({ message: "Time slot not found." });
    }

    if (!slot.remainingCapacity || slot.remainingCapacity <= 0) {
      // Slot exists but no capacity
      await AppointmentModel.deleteOne({ _id: slot._id });
      return res
        .status(409)
        .json({ message: "No available workers for this time slot." });
    }

    // Find current appointments at this time
    const overlappingAppointments = await AppointmentModel.find({
      title: { $regex: "^Booked Appointment" },
      start: formattedStart,
      end: formattedEnd,
    });

    // Find all workers
    const workers = await UserModel.find({ role: "worker" });

    // Find a free worker
    const bookedWorkerIds = overlappingAppointments.map((appt) => appt.ownerId);
    const availableWorker = workers.find(
      (worker) => !bookedWorkerIds.includes(worker.id)
    );

    if (!availableWorker) {
      return res
        .status(409)
        .json({ message: "All workers are busy at this time." });
    }

    // Determine client name if available
    const user =
      eventData.clientId && typeof eventData.clientId === "string"
        ? await UserModel.findById(eventData.clientId)
        : null;

    // Step 1: Create new booked appointment
    const booked = await AppointmentModel.create({
      title: `Booked Appointment with ${availableWorker.firstName}`,
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      description: eventData.description || "",
      ownerId: availableWorker.id,
      clientId: eventData.clientId ?? `guest-${Date.now()}`,
      clientName: eventData.clientName ?? user?.firstName ?? "Guest",
    });

    // Step 2: Update the slot's remaining capacity
    const updatedSlot = await AppointmentModel.findByIdAndUpdate(
      slot._id,
      { $inc: { remainingCapacity: -1 } },
      { new: true }
    );

    // Step 3: Delete the slot if capacity is exhausted
    if (
      updatedSlot &&
      typeof updatedSlot.remainingCapacity === "number" &&
      updatedSlot.remainingCapacity <= 0
    ) {
      await AppointmentModel.deleteOne({ _id: slot._id });
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
