USE qr_parking;

ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN DEFAULT FALSE AFTER qr_code_id,
  ADD COLUMN membership_status ENUM('inactive', 'active') DEFAULT 'inactive' AFTER is_admin,
  ADD COLUMN can_create_qr BOOLEAN DEFAULT FALSE AFTER membership_status,
  ADD COLUMN can_hide_number BOOLEAN DEFAULT TRUE AFTER can_create_qr;

INSERT INTO users
  (name, email, phone, password, is_admin, membership_status, can_create_qr, can_hide_number)
VALUES
  ('Rahul Admin', 'rahul@gmail.com', '9999999999', 'rahul@100', TRUE, 'active', TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  is_admin = TRUE,
  membership_status = 'active',
  can_create_qr = TRUE,
  can_hide_number = TRUE;
