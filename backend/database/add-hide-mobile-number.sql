USE qr_parking;

ALTER TABLE vehicles
  ADD COLUMN hide_mobile_number BOOLEAN DEFAULT FALSE AFTER mobile_number;
