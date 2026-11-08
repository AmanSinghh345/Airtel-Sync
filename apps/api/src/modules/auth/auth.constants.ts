import { StaffRole } from '@udyamone/shared-types';

export const AUTH_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'udyamone_secret_jwt_key_accel_telecom_2026_enterprise',
  JWT_ISSUER: process.env.JWT_ISSUER || 'udyamone-auth',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'udyamone-staff',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  ROLES_KEY: 'roles'
};

export const DEMO_STAFF_USERS = [
  {
    email: 'compliance@accel.telecom',
    fullName: 'Pooja Sharma (Chief Compliance Officer)',
    role: StaffRole.COMPLIANCE_OFFICER,
    plainPassword: 'Accel@2026!Compliance'
  },
  {
    email: 'admin@accel.telecom',
    fullName: 'Anand Verma (System Admin)',
    role: StaffRole.ADMIN,
    plainPassword: 'Accel@2026!Admin'
  },
  {
    email: 'ops@accel.telecom',
    fullName: 'Vikram Malhotra (Fulfillment Operations)',
    role: StaffRole.OPERATIONS,
    plainPassword: 'Accel@2026!Operations'
  },
  {
    email: 'tech@accel.telecom',
    fullName: 'Suresh Raina (Field Technician)',
    role: StaffRole.TECHNICIAN,
    plainPassword: 'Accel@2026!Technician'
  }
];
