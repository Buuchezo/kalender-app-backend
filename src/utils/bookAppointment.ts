import { Request, Response, NextFunction } from "express";
import { parseISO, format, isAfter, isBefore } from "date-fns";
import { AppointmentModel } from "../models/appointmentModel";
import { UserModel } from "../models/userModel";
import { IUser } from "../models/userModel";
import { ObjectId } from "mongodb";
import { Types } from "mongoose";

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

// export async function bookAppointmentMiddleware(
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const { eventData } = req.body;

//     if (!eventData || !eventData.start || !eventData.end) {
//       res.status(400).json({ message: "Missing required event data." });
//       return;
//     }

//     const formattedStart = normalizeToScheduleXFormat(eventData.start);
//     const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//     const [workers, slot] = await Promise.all([
//       UserModel.find({ role: "worker" }),
//       AppointmentModel.findOne({
//         start: formattedStart,
//         end: formattedEnd,
//         calendarId: "available",
//       }),
//     ]);

//     if (!slot) {
//       res.status(404).json({ message: "No available slot found." });
//       return;
//     }

//     if (slot.remainingCapacity === undefined) {
//       slot.remainingCapacity = workers.length;
//     }

//     const user = req.user;
//     const isAdmin = user?.role === "admin";
//     const userId = user?.id || user?._id?.toString?.();

//     // Get overlapping booked appointments for this time
//     let overlappingBooked = await AppointmentModel.find({
//       start: formattedStart,
//       end: formattedEnd,
//       title: { $regex: "^Booked Appointment" },
//     });

//     if (!isAdmin && userId) {
//       overlappingBooked = overlappingBooked.filter(
//         (appointment) =>
//           appointment.clientId?.toString?.() === userId.toString()
//       );
//     }

//     const bookedWorkerIds = overlappingBooked.map((e) =>
//       e.ownerId?.toString?.()
//     );

//     const freeWorker = workers.find((w) => {
//       const rawId =
//         w.id ||
//         (typeof w._id === "object" && w._id !== null && "toString" in w._id
//           ? (w._id as { toString: () => string }).toString()
//           : null);

//       if (!rawId || !ObjectId.isValid(rawId)) return false;

//       return !bookedWorkerIds.includes(rawId);
//     });

//     if (!freeWorker) {
//       res.status(409).json({ message: "No available workers left." });
//       return;
//     }

//     // Assign client details
//     const clientId = userId ?? `guest-${Date.now()}`;
//     const clientName = user?.firstName ?? eventData.clientName ?? "Guest";

//     // Update the existing slot instead of creating a new one
//     slot.title = `Booked Appointment with ${freeWorker.firstName}`;
//     slot.description = eventData.description || "";
//     slot.ownerId = freeWorker.id || freeWorker._id;
//     slot.clientId = clientId;
//     slot.clientName = clientName;
//     slot.calendarId = "booked";

//     // Adjust remaining capacity (if not admin)
//     if (!isAdmin) {
//       slot.remainingCapacity -= 1;
//     }

//     await slot.save();

//     req.body.updatedAppointment = slot;
//     next();
//   } catch (err) {
//     console.error("Booking error:", err);
//     res.status(500).json({
//       message: err instanceof Error ? err.message : "Internal server error",
//     });
//   }
// }

////////////////////////////////////////////////////////////////////////////////////////
// export async function bookAppointmentMiddleware(
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const { eventData } = req.body;
//     if (!eventData || !eventData.start || !eventData.end) {
//       return res.status(400).json({ message: "Missing required event data." });
//     }

//     const formattedStart = normalizeToScheduleXFormat(eventData.start);
//     const formattedEnd = normalizeToScheduleXFormat(eventData.end);

//     const [workers, slot] = await Promise.all([
//       UserModel.find({ role: "worker" }),
//       AppointmentModel.findOne({
//         start: formattedStart,
//         end: formattedEnd,
//         calendarId: "available",
//       }),
//     ]);

//     if (!slot) {
//       return res.status(404).json({ message: "No available slot found." });
//     }

//     if (slot.remainingCapacity === undefined) {
//       slot.remainingCapacity = workers.length;
//     }

//     const user = req.user;

//     console.log;
//     const isAdmin = user?.role === "admin";
//     const userId =
//       user?.id?.toString?.() || user?._id?.toString?.() || eventData.clientId;

//     if (!userId) {
//       return res.status(400).json({ message: "Missing user ID." });
//     }

//     // Initialize bookings array if missing
//     if (!Array.isArray(slot.bookings)) {
//       slot.bookings = [];
//     }

//     // Prevent duplicate bookings by the same user
//     const alreadyBooked = slot.bookings.some(
//       (b) => b.clientId?.toString() === userId
//     );
//     if (alreadyBooked) {
//       return res
//         .status(409)
//         .json({ message: "You have already booked this slot." });
//     }

//     const bookedWorkerIds = slot.bookings.map((b) => b.ownerId?.toString?.());

//     const freeWorker = workers.find((w) => {
//       const wId = w._id?.toString?.();
//       return wId && !bookedWorkerIds.includes(wId);
//     });

//     if (!freeWorker) {
//       return res
//         .status(409)
//         .json({ message: "No available workers left for this time." });
//     }

//     const clientId = userId ?? `guest-${Date.now()}`;
//     const clientName = user?.firstName ?? eventData.clientName ?? "Guest";
//     // Add booking to the slot
//     slot.bookings.push({
//       ownerId: (freeWorker.id || freeWorker._id) as string | Types.ObjectId,
//       clientId: clientId as string | Types.ObjectId,
//       clientName,
//       description: eventData.description || "",
//     });

//     // Update capacity and status
//     slot.remainingCapacity -= 1;

//     if (slot.remainingCapacity <= 0) {
//       slot.calendarId = "booked";
//       slot.title = "Fully Booked";
//     } else {
//       slot.title = "Available Slot";
//     }

//     await slot.save();

//     req.body.updatedAppointment = slot;
//     next();
//   } catch (err) {
//     console.error("Booking error:", err);
//     res.status(500).json({
//       message: err instanceof Error ? err.message : "Internal server error",
//     });
//   }
// }

////////////////////////////////////////////////////////////////////////////////////////////////

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
    const parsedStart = parseISO(formattedStart);
    const parsedEnd = parseISO(formattedEnd);

    const [workers, allAppointments] = await Promise.all([
      UserModel.find({ role: "worker" }),
      AppointmentModel.find({
        $or: [
          {
            start: { $lt: formattedEnd },
            end: { $gt: formattedStart },
          },
        ],
      }),
    ]);

    if (!workers.length) {
      return res.status(404).json({ message: "No workers found." });
    }

    const overlappingSlots = allAppointments.filter((slot) => {
      if (slot.calendarId !== "booked" && slot.calendarId !== "available")
        return false;
      const slotStart = parseISO(normalizeToScheduleXFormat(slot.start));
      const slotEnd = parseISO(normalizeToScheduleXFormat(slot.end));
      return isBefore(parsedStart, slotEnd) && isAfter(parsedEnd, slotStart);
    });

    const targetSlot = allAppointments.find(
      (slot) =>
        slot.calendarId === "available" &&
        normalizeToScheduleXFormat(slot.start) === formattedStart &&
        normalizeToScheduleXFormat(slot.end) === formattedEnd
    );

    if (!targetSlot) {
      return res
        .status(404)
        .json({ message: "No available slot found for requested time." });
    }

    if (typeof targetSlot.remainingCapacity !== "number") {
      targetSlot.remainingCapacity = workers.length;
    }

    const user = req.user;

    let clientIdObj: Types.ObjectId | undefined;
    if (eventData.clientId && Types.ObjectId.isValid(eventData.clientId)) {
      clientIdObj = new Types.ObjectId(eventData.clientId);
    } else if (user?.id && Types.ObjectId.isValid(user.id)) {
      clientIdObj = new Types.ObjectId(user.id);
    } else {
      return res.status(400).json({ message: "Invalid or missing client ID." });
    }

    if (!Array.isArray(targetSlot.bookings)) {
      targetSlot.bookings = [];
    }

    const userAlreadyBooked = overlappingSlots.some(
      (slot) =>
        Array.isArray(slot.bookings) &&
        slot.bookings.some(
          (b) => b.clientId?.toString() === clientIdObj?.toString()
        )
    );

    if (userAlreadyBooked) {
      return res.status(409).json({
        message: "You have already booked an overlapping appointment.",
      });
    }

    const bookedWorkerIds = overlappingSlots
      .flatMap((slot) => slot.bookings || [])
      .map((b) => b.ownerId?.toString())
      .filter(Boolean);

    const freeWorkerRaw = workers.find(
      (w) => w._id && !bookedWorkerIds.includes(w._id.toString())
    );

    if (!freeWorkerRaw) {
      return res
        .status(409)
        .json({ message: "No available workers left for this time." });
    }

    const ownerId =
      freeWorkerRaw._id instanceof Types.ObjectId
        ? freeWorkerRaw._id
        : typeof freeWorkerRaw._id === "string" &&
            Types.ObjectId.isValid(freeWorkerRaw._id)
          ? new Types.ObjectId(freeWorkerRaw._id)
          : undefined;

    if (!ownerId) {
      return res.status(500).json({ message: "Invalid worker ID" });
    }

    const clientName = user?.firstName ?? eventData.clientName ?? "Guest";

    targetSlot.bookings.push({
      ownerId,
      clientId: clientIdObj,
      clientName,
      description: eventData.description || "",
    });

    targetSlot.remainingCapacity -= 1;

    if (targetSlot.remainingCapacity <= 0) {
      targetSlot.calendarId = "booked";
      targetSlot.title = "Fully Booked";
    } else {
      targetSlot.calendarId = "available";
      targetSlot.title = "Available Slot";
    }

    await targetSlot.save();

    // Debug log to verify updates
    console.log("Slot updated:", {
      calendarId: targetSlot.calendarId,
      remainingCapacity: targetSlot.remainingCapacity,
      title: targetSlot.title,
    });

    req.body.updatedAppointment = targetSlot;

    next();
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
