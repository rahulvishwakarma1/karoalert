-- qralertgo Database Schema

-- Create database
CREATE DATABASE IF NOT EXISTS qr_parking;
USE qr_parking;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    car_number VARCHAR(50),
    qr_code_id VARCHAR(36),
    is_admin BOOLEAN DEFAULT FALSE,
    membership_status ENUM('inactive', 'active') DEFAULT 'inactive',
    membership_expires_at DATETIME NULL,
    can_create_qr BOOLEAN DEFAULT FALSE,
    can_hide_number BOOLEAN DEFAULT FALSE,
    fcm_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_qr_code_id (qr_code_id)
);

-- Vehicles table
CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL DEFAULT 'Car',
    vehicle_number VARCHAR(50) NOT NULL,
    vehicle_model VARCHAR(100),
    vehicle_color VARCHAR(50),
    owner_name VARCHAR(100),
    mobile_number VARCHAR(20),
    hide_mobile_number BOOLEAN DEFAULT FALSE,
    emergency_number VARCHAR(20),
    hide_emergency_number BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_vehicle_number (vehicle_number)
);

-- QR Codes table
CREATE TABLE qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    vehicle_id INT DEFAULT NULL,
    qr_code_id VARCHAR(36) UNIQUE NOT NULL,
    qr_data JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    INDEX idx_qr_code_id (qr_code_id),
    INDEX idx_user_id (user_id),
    INDEX idx_vehicle_id (vehicle_id)
);

-- Scan history table
CREATE TABLE scan_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    qr_code_id VARCHAR(36) NOT NULL,
    user_id INT NOT NULL,
    vehicle_id INT DEFAULT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notification_sent BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (qr_code_id) REFERENCES qr_codes(qr_code_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    INDEX idx_qr_code_id (qr_code_id),
    INDEX idx_user_id (user_id),
    INDEX idx_scanned_at (scanned_at)
);

-- Notifications table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sender_name VARCHAR(100),
    sender_mobile VARCHAR(20),
    message TEXT NOT NULL,
    notification_type ENUM('CALL', 'WHATSAPP', 'NOTIFICATION') DEFAULT 'NOTIFICATION',
    status ENUM('PENDING', 'SENT', 'FAILED') DEFAULT 'PENDING',
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Payment records table
CREATE TABLE payment_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT 'razorpay',
    payment_id VARCHAR(120) NOT NULL,
    order_id VARCHAR(120),
    signature VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL DEFAULT 499.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status ENUM('paid', 'failed') NOT NULL DEFAULT 'paid',
    raw_payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_provider_payment (provider, payment_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);
