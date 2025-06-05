import { NextFunction, Request, Response } from "express";
import { AppointmentModel } from "../models/appointmentModel";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import { endOfMonth, startOfMonth } from "date-fns";

type SanitizedQuery = Record<string, string | string[] | undefined>;

export const getAllAppointments = catchAsync(
  async (req: Request & { sanitizedQuery?: SanitizedQuery }, res: Response) => {
    const query = req.sanitizedQuery ?? req.query;
    const appointments = await AppointmentModel.find(query);
    res.status(200).json({
      status: "success",
      results: appointments.length,
      data: {
        appointments,
      },
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

    const existingSlots = await AppointmentModel.find({
      calendarId: "available",
      start: { $gte: startDate, $lte: endDate },
    }).select("start end");

    const existingSet = new Set(
      existingSlots.map(
        (s) =>
          `${new Date(s.start).toISOString()}_${new Date(s.end).toISOString()}`
      )
    );

    const uniqueSlots = slots.filter((slot) => {
      const key = `${new Date(slot.start).toISOString()}_${new Date(
        slot.end
      ).toISOString()}`;
      return !existingSet.has(key);
    });

    if (uniqueSlots.length === 0) {
       res.status(200).json({
        status: "success",
        message: "All slots already exist for this month.",
        results: 0,
        data: { appointments: existingSlots },
      })
      return;
    }

    const insertedSlots = await AppointmentModel.insertMany(uniqueSlots);

    res.status(201).json({
      status: "success",
      message: `${insertedSlots.length} new slots created.`,
      results: insertedSlots.length,
      data: { appointments: insertedSlots },
    });
  }
);
export const updateAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const appointment = await AppointmentModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!appointment) {
      return next(new AppError("No appointment found with that id", 404));
    }

    res.status(200).json({
      status: "success",
      data: { appointment },
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
