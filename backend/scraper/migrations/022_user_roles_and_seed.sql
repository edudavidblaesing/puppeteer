-- Add role column to admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'admin';

-- Create seed users if they don't exist (Password hashes will be updated by application logic to ensure correctness)
-- We insert placeholders here, application startup will fix passwords if they match default/placeholder
INSERT INTO admin_users (username, password_hash, role)
SELECT 'admin', '$2a$10$hashed_password_placeholder', 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE username = 'admin');

INSERT INTO admin_users (username, password_hash, role)
SELECT 'mine', '$2a$10$hashed_password_placeholder', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE username = 'mine');

-- Update roles for existing users
UPDATE admin_users SET role = 'superadmin' WHERE username = 'admin';
UPDATE admin_users SET role = 'admin' WHERE username = 'mine';
