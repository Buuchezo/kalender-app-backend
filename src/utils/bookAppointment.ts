import { Request, Response, NextFunction } from "express";
import { parseISO, format } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { IUser } from "../models/userModel";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";

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

// PATCH-style booking using existing slot
export async function bookAppointmentMiddleware(
  req: AuthenticatedRequest,
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

    const slot = await AppointmentModel.findOne({
      start: formattedStart,
      end: formattedEnd,
      calendarId: "available",
    });

    if (!slot) {
      return res.status(404).json({ message: "No available slot found." });
    }

    if (slot.remainingCapacity === undefined) {
      return res
        .status(400)
        .json({ message: "Slot missing remaining capacity." });
    }

    const user = req.user;
    const clientId = user?.id ?? null;
    const clientName = user?.firstName ?? eventData.clientName ?? "Guest";

    // Prevent invalid clientId format
    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid clientId format." });
    }

    // Prevent duplicate booking by same user
    if (slot.sharedWith?.some((id) => id.toString() === clientId)) {
      return res.status(409).json({ message: "You already booked this slot." });
    }

    slot.clientId = clientId;
    slot.clientName = clientName;
    slot.title = `Booked Appointment`;
    slot.description = eventData.description || "";
    slot.calendarId = "booked";

    // Add to sharedWith
    slot.sharedWith = slot.sharedWith || [];
    slot.sharedWith.push(new mongoose.Types.ObjectId(clientId));

    // Decrease capacity
    slot.remainingCapacity = Math.max(0, slot.remainingCapacity - 1);

    // Final status update
    if (slot.remainingCapacity === 0) {
      slot.calendarId = "booked";
    }

    const updatedAppointment = await slot.save();

    req.body.updatedAppointment = updatedAppointment;
    next();
  } catch (err) {
    console.error("Error booking appointment:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
