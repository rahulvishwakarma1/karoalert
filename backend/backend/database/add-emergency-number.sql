USE qr_parking;

ALTER TABLE vehicles
  ADD COLUMN emergency_number VARCHAR(20) NULL AFTER hide_mobile_number,
  ADD COLUMN hide_emergency_number BOOLEAN DEFAULT FALSE AFTER emergency_number;
