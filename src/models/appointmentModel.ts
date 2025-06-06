import mongoose, { Schema, Document, Types } from "mongoose";
import slugify from "slugify";

// Interface to type the User document
export interface IBooking {
  ownerId: string | Types.ObjectId;
  clientId: string | Types.ObjectId;
  clientName: string;
  description?: string;
  workerName?: string;
  start?: string; // add these if you want
  end?: string;
}
export interface IAppointment extends Document {
  slug: string;
  title: string;
  description: string;
  start: string;
  end: string;
  calendarId?: "available" | "booked";
  ownerId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  clientName?: string;
  sharedWith?: mongoose.Types.ObjectId[];
  visibility?: "public" | "internal";
  remainingCapacity?: number;
  bookings?: IBooking[];
}

const appointmentSchema = new Schema<IAppointment>({
  slug: { type: String, unique: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  calendarId: {
    type: String,
    enum: ["available", "booked"],
    default: "available",
  },
  ownerId: { type: Schema.Types.Mixed, ref: "User" }, // kept for legacy use
  clientId: { type: Schema.Types.Mixed, ref: "User" }, // kept for legacy use
  clientName: { type: String },
  sharedWith: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  visibility: {
    type: String,
    enum: ["public", "internal"],
    default: "public",
  },
  remainingCapacity: { type: Number, default: 3 },

  // ✅ NEW: List of bookings (one per client-worker pair)
  bookings: [
    {
      ownerId: { type: Schema.Types.ObjectId, ref: "User" },
      clientId: { type: Schema.Types.ObjectId, ref: "User" },
      clientName: String,
      description: String,
    },
  ],
});

//rund before the .save() and .create()
appointmentSchema.pre("save", function (next) {
  this.slug = slugify(this.title, { lower: true });
  next();
});

// Create the User model
export const AppointmentModel = mongoose.model<IAppointment>(
  "Appointment",
  appointmentSchema
);
