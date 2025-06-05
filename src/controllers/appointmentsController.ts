import { NextFunction, Request, Response } from "express";
import { AppointmentModel } from "../models/appointmentModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import { endOfMonth, startOfMonth } from "date-fns";

type SanitizedQuery = Record<string, string | string[] | undefined>;

export const getAllAppointments = catchAsync(
  async (req: Request & { sanitizedQuery?: SanitizedQuery }, res: Response) => {
    const queryParams = req.sanitizedQuery ?? req.query;
    const mongoQuery: Record<string, any> = {};

    // Optional: Filter by year/month if provided
    const year = queryParams.year
      ? parseInt(queryParams.year as string, 10)
      : undefined;
    const month = queryParams.month
      ? parseInt(queryParams.month as string, 10)
      : undefined;

    if ((year && isNaN(year)) || (month && isNaN(month))) {
      res.status(400).json({
        status: "fail",
        message: "Invalid 'year' or 'month' query parameter.",
      });
      return;
    }

    if (year !== undefined && month !== undefined) {
      const startDate = startOfMonth(new Date(year, month));
      const endDate = endOfMonth(startDate);
      mongoQuery.start = { $gte: startDate, $lte: endDate };
    }

    // Copy other filters (e.g., calendarId, title, clientId, etc.)
    const ignoredKeys = ["year", "month"];
    for (const key in queryParams) {
      if (!ignoredKeys.includes(key) && queryParams[key] !== undefined) {
        mongoQuery[key] = queryParams[key];
      }
    }

    const appointments = await AppointmentModel.find(mongoQuery);

    res.status(200).json({
      status: "success",
      results: appointments.length,
      data: { appointments },
    });
  }
);
export const getAppointment = catchAsync(
  async (
    req: Request & { sanitizedQuery?: SanitizedQuery },
    res: Response,
    next: NextFunction
  ) => {
    const appointment = await AppointmentModel.findById(req.params.id);
    if (!appointment) {
      return next(new AppError("No appointment found with that id", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        appointment,
      },
    });
  }
);

export const createAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const { year, month, slots } = req.body;

    if (typeof year !== "number" || typeof month !== "number") {
      res.status(400).json({ message: "Year and month are required." });
      return;
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      res.status(400).json({ message: "No appointment slots to create." });
      return;
    }

    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));

    const existingAppointments = await AppointmentModel.find({
      start: { $gte: startDate, $lte: endDate },
      title: "Available Slot", // Only block if Available Slots already exist
    });

    if (existingAppointments.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Appointments already exist for this month.",
        results: existingAppointments.length,
        data: { appointments: existingAppointments },
      });
      return;
    }

    const insertedSlots = await AppointmentModel.insertMany(slots);

    res.status(201).json({
      status: "success",
      message: `${insertedSlots.length} slots created.`,
      results: insertedSlots.length,
      data: { appointments: insertedSlots },
    });
  }
);
export const updateAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const slotId = req.params.id;
    const eventData = req.body.eventData;

    // 1. Find the appointment
    const appointment = await AppointmentModel.findById(slotId);
    if (!appointment) {
      return next(new AppError("No appointment found with that ID", 404));
    }

    // 2. Block update if appointment is fully booked
    if (
      appointment.remainingCapacity !== undefined &&
      appointment.remainingCapacity <= 0
    ) {
      return next(new AppError("This slot is already fully booked.", 400));
    }

    // 3. Decrement capacity
    if (appointment.remainingCapacity === undefined) {
      appointment.remainingCapacity = 2; // fallback default
    } else {
      appointment.remainingCapacity -= 1;
    }

    // 4. Add client info
    if (eventData.clientId) {
      appointment.clientId = eventData.clientId;
      appointment.clientName = eventData.clientName || "Unknown";
    }

    // Optional: track shared clients
    if (
      eventData.clientId &&
      !appointment.sharedWith?.includes(eventData.clientId)
    ) {
      appointment.sharedWith?.push(eventData.clientId);
    }

    // 5. Set title and calendar state
    appointment.title = "Booked Appointment";
    appointment.description = eventData.description || appointment.description;

    // If no remaining capacity, lock it
    if (appointment.remainingCapacity <= 0) {
      appointment.calendarId = "booked";
    }

    // 6. Save and respond
    await appointment.save();

    res.status(200).json({
      status: "success",
      data: {
        appointment,
      },
    });
  }
);

export const deleteAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const appointment = await AppointmentModel.findByIdAndDelete(req.params.id);
    if (!appointment) {
      return next(new AppError("No appointment found with that id", 404));
    }
    res.status(204).json({
      status: "success",
    });
  }
);

export const reassignAppointmentsController = catchAsync(
  async (req: Request, res: Response) => {
    const updated = req.body.updatedEvents;

    if (!updated || updated.length === 0) {
      res.status(200).json({
        status: "success",
        message: "No appointments were reassigned.",
        data: [],
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `${updated.length} appointments reassigned.`,
      data: updated,
    });
  }
);
