import { Request, Response, NextFunction } from "express";
import { parseISO, format } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { IUser } from "../models/userModel";
import { ObjectId } from "mongodb";

interface AuthenticatedRequest extends Request {
  user?: IUser;
}


function normalizeToScheduleXFormat(datetime: string): string {
  try {
    return format(parseISO(datetime), "yyyy-MM-dd HH:mm");
  } catch {
    return datetime;
  }
}

export async function bookAppointmentMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { eventData } = req.body;

    if (!eventData || !eventData.start || !eventData.end) {
      res.status(400).json({ message: "Missing required event data." });
      return;
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
      res.status(404).json({ message: "No available slot found." });
      return;
    }

    if (slot.remainingCapacity === undefined) {
      slot.remainingCapacity = workers.length;
    }

    // Determine current user and role
    const user = req.user  ;
    const isAdmin = user?.role === "admin";
    const userId = user?.id || user?._id?.toString?.();

    // Fetch booked appointments (filter by user if NOT admin)
    let overlappingBooked = await AppointmentModel.find({
      start: formattedStart,
      end: formattedEnd,
      title: { $regex: "^Booked Appointment" },
    });

    if (!isAdmin && userId) {
      overlappingBooked = overlappingBooked.filter(
        (appointment) =>
          appointment.clientId?.toString?.() === userId.toString()
      );
    }

    const bookedWorkerIds = overlappingBooked.map((e) => e.ownerId);

    const freeWorker = workers.find((w) => {
      const rawId =
        w.id ||
        (typeof w._id === "object" && w._id !== null && "toString" in w._id
          ? (w._id as { toString: () => string }).toString()
          : null);

      if (!rawId || !ObjectId.isValid(rawId)) return false;

      const objectId = new ObjectId(rawId);

      return !bookedWorkerIds.includes(objectId);
    });

    if (!freeWorker) {
      res.status(409).json({ message: "No available workers left." });
      return;
    }

    // Determine who the client is
    const clientId = userId ?? `guest-${Date.now()}`;
    const clientName = user?.firstName ?? eventData.clientName ?? "Guest";

    // Create the booked appointment
    const booked = await AppointmentModel.create({
      title: `Booked Appointment with ${freeWorker.firstName}`,
      description: eventData.description || "",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      ownerId: freeWorker.id || freeWorker._id,
      clientId,
      clientName,
    });

    // Dynamically update remainingCapacity (only reduce for users, not admin overrides)
    if (!isAdmin) {
      const allBookedForSlot = await AppointmentModel.find({
        start: formattedStart,
        end: formattedEnd,
        calendarId: "booked",
      });

      const currentUsed = allBookedForSlot.length;
      slot.remainingCapacity = workers.length - currentUsed;

      if (slot.remainingCapacity <= 0) {
        await AppointmentModel.deleteOne({ _id: slot._id });
      } else {
        await slot.save();
      }
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
