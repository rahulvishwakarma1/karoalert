-- =============================================================
-- PRIVATE CALL SYSTEM MIGRATION
-- Adds communication_settings, private_call tables, indexing
-- Preserves all existing data and tables.
-- =============================================================

-- 1. COMMUNICATION SETTINGS
-- Stores per-user toggle states for QR scan page options
CREATE TABLE IF NOT EXISTS communication_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    alert_owner BOOLEAN DEFAULT TRUE,
    app_call BOOLEAN DEFAULT TRUE,
    normal_call BOOLEAN DEFAULT TRUE,
    private_call BOOLEAN DEFAULT FALSE,
    emergency_call BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_communication_user (user_id)
);

-- Insert default communication settings for existing users
INSERT IGNORE INTO communication_settings (user_id, alert_owner, app_call, normal_call, private_call, emergency_call)
SELECT id, TRUE, TRUE, TRUE, FALSE, TRUE FROM users;

-- 2. PRIVATE CALL PLANS
-- Admin-defined plans for caller seconds purchase
CREATE TABLE IF NOT EXISTS private_call_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    display_minutes DECIMAL(10,2) NOT NULL COMMENT 'Marketing display minutes',
    actual_seconds INT NOT NULL COMMENT 'Actual seconds for billing',
    is_active BOOLEAN DEFAULT TRUE,
    plan_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_plan_active (is_active),
    INDEX idx_plan_order (plan_order)
);

-- Default plans
INSERT IGNORE INTO private_call_plans (name, description, price, display_minutes, actual_seconds, is_active, plan_order) VALUES
('Quick Call', 'Short call for quick conversation', 11.00, 1.5, 120, TRUE, 1),
('Standard Call', 'Standard call plan', 100.00, 20, 900, TRUE, 2);

-- 3. PRIVATE CALL TRANSACTIONS
-- Stores payment records for private call plans
CREATE TABLE IF NOT EXISTS private_call_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    type ENUM('caller_seconds', 'owner_service') NOT NULL,
    payment_id VARCHAR(120),
    order_id VARCHAR(120),
    signature VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    seconds_added INT DEFAULT 0,
    status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    provider VARCHAR(40) DEFAULT 'razorpay',
    raw_payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES private_call_plans(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_provider_payment (provider, payment_id),
    INDEX idx_txn_user (user_id),
    INDEX idx_txn_status (status),
    INDEX idx_txn_created (created_at)
);

-- 4. PRIVATE CALL BALANCES
-- Caller seconds balance (accumulated across purchases)
CREATE TABLE IF NOT EXISTS private_call_balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    remaining_seconds INT NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0),
    total_seconds_purchased INT NOT NULL DEFAULT 0,
    total_seconds_used INT NOT NULL DEFAULT 0,
    last_purchase_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_balance_user (user_id)
);

-- Initialize balance for existing users
INSERT IGNORE INTO private_call_balances (user_id, remaining_seconds)
SELECT id, 0 FROM users;

-- 5. PRIVATE CALL OWNER SERVICES
-- QR owner's receiving service (must be active for private call to be visible)
CREATE TABLE IF NOT EXISTS private_call_owner_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT FALSE,
    service_expires_at DATETIME NULL,
    total_seconds_purchased INT NOT NULL DEFAULT 0,
    last_recharge_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_owner_service_user (user_id),
    INDEX idx_owner_service_active (is_active)
);

-- Initialize owner services for existing users
INSERT IGNORE INTO private_call_owner_services (user_id, is_active)
SELECT id, FALSE FROM users;

-- 6. PRIVATE CALL HISTORY
-- Tracks every private call made
CREATE TABLE IF NOT EXISTS private_call_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    caller_user_id INT NOT NULL,
    owner_user_id INT NOT NULL,
    qr_code_id VARCHAR(36),
    receiver_phone_encrypted VARCHAR(255) COMMENT 'Encrypted owner number',
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    duration_seconds INT DEFAULT 0,
    seconds_used INT DEFAULT 0,
    cost DECIMAL(10,2) DEFAULT 0.00,
    payment_id VARCHAR(120),
    call_status ENUM('initiated','ringing','connected','completed','failed','no_answer','insufficient_balance','owner_service_inactive') DEFAULT 'initiated',
    twilio_call_sid VARCHAR(255),
    twilio_conference_sid VARCHAR(255),
    disconnect_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (caller_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_call_caller (caller_user_id),
    INDEX idx_call_owner (owner_user_id),
    INDEX idx_call_status (call_status),
    INDEX idx_call_start (start_time),
    INDEX idx_call_qr (qr_code_id)
);

-- 7. PRIVATE CALL DEDUCTIONS
-- Second-by-second deduction audit trail
CREATE TABLE IF NOT EXISTS private_call_deductions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    call_id INT NOT NULL,
    user_id INT NOT NULL,
    seconds_before INT NOT NULL,
    seconds_after INT NOT NULL,
    deducted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES private_call_history(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_deduction_call (call_id),
    INDEX idx_deduction_user (user_id),
    INDEX idx_deduction_time (deducted_at)
);

-- =============================================================
-- Add admin flag columns if not exist
-- =============================================================
-- ALTER TABLE is handled by the application code at runtime if needed.
-- Users table already has can_hide_number - can_manage_private_call
-- will be added via application migration if required.
