import { Request, Response, NextFunction } from "express";
import { parseISO, format } from "date-fns";
import mongoose from "mongoose";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel, IUser } from "../models/userModel";
import { IAppointment } from "../models/appointmentModel";

// Extend Express request to support authenticated user
interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// Worker type for assignment
interface Worker {
  id: mongoose.Types.ObjectId;
  name: string;
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
    const {
      eventData,
      workers,
    }: {
      eventData: {
        title?: string;
        description?: string;
        start: string;
        end: string;
        clientId?: mongoose.Types.ObjectId;
        clientName?: string;
      };
      workers: Worker[];
    } = req.body;

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const formattedStart = normalizeToScheduleXFormat(eventData.start);
    const formattedEnd = normalizeToScheduleXFormat(eventData.end);

    const parsedStart = parseISO(formattedStart);
    const parsedEnd = parseISO(formattedEnd);

    // 1. Find overlapping booked appointments
    const overlappingAppointments: IAppointment[] = await AppointmentModel.find(
      {
        title: { $regex: "^Booked Appointment" },
        start: { $lt: formattedEnd },
        end: { $gt: formattedStart },
      }
    );

    // 2. Find a free worker
    const freeWorker = workers.find(
      (worker) =>
        !overlappingAppointments.some(
          (appt) => appt.ownerId?.toString() === worker.id.toString()
        )
    );

    if (!freeWorker) {
      return res
        .status(409)
        .json({ message: "No available workers for this time slot." });
    }

    // 3. If fully booked, remove the available slot
    const totalBooked = overlappingAppointments.length + 1;
    const isFullyBooked = totalBooked >= workers.length;

    if (isFullyBooked) {
      await AppointmentModel.deleteOne({
        title: "Available Slot",
        start: formattedStart,
        end: formattedEnd,
      });
    }

    // 4. Build client info
    const clientId =
      eventData.clientId ?? user._id ?? new mongoose.Types.ObjectId();
    const clientName =
      eventData.clientName ??
      (user ? `${user.firstName} ${user.lastName}` : "Guest");

    // 5. Create and save appointment
    const newAppointment = new AppointmentModel({
      slug: `appt-${Date.now()}`,
      title: `Booked Appointment with ${freeWorker.name}`,
      description: eventData.description || "",
      start: formattedStart,
      end: formattedEnd,
      calendarId: "booked",
      ownerId: freeWorker.id,
      clientId,
      clientName,
      visibility: "internal",
      remainingCapacity: 0,
    });

    await newAppointment.save();

    return res
      .status(201)
      .json({ message: "Appointment booked successfully." });
  } catch (error) {
    console.error("Appointment booking error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
