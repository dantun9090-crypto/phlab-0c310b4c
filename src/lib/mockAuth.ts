// Mock Authentication System for Testing (Local Storage Based)
// This allows testing without Firebase configuration

import { Timestamp } from 'firebase/firestore';

export interface MockUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Timestamp;
}

// Generate unique ID
const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Get users from localStorage
const getUsers = (): MockUser[] => {
  const stored = localStorage.getItem('php_mock_users');
  return stored ? JSON.parse(stored) : [];
};

// Save users to localStorage
const saveUsers = (users: MockUser[]) => {
  localStorage.setItem('php_mock_users', JSON.stringify(users));
};

// Get current session
const getCurrentSession = (): MockUser | null => {
  const stored = localStorage.getItem('php_mock_session');
  return stored ? JSON.parse(stored) : null;
};

// Save session
const saveSession = (user: MockUser | null) => {
  if (user) {
    localStorage.setItem('php_mock_session', JSON.stringify(user));
  } else {
    localStorage.removeItem('php_mock_session');
  }
};

// Mock register function
export const mockRegisterUser = async (
  email: string,
  _password: string,
  firstName: string,
  lastName: string
): Promise<MockUser> => {
  const users = getUsers();

  // Check if email already exists
  if (users.some(u => u.email === email)) {
    const error: any = new Error('Email already in use');
    error.code = 'auth/email-already-in-use';
    throw error;
  }

  // Create new user
  const newUser: MockUser = {
    uid: generateId(),
    email,
    firstName,
    lastName,
    createdAt: Timestamp.now()
  };

  // Save user
  users.push(newUser);
  saveUsers(users);

  // Create session
  saveSession(newUser);

  return newUser;
};

// Mock login function
export const mockLoginUser = async (email: string, _password: string): Promise<MockUser> => {
  const users = getUsers();

  // Find user by email
  const user = users.find(u => u.email === email);

  if (!user) {
    const error: any = new Error('Invalid email or password');
    error.code = 'auth/user-not-found';
    throw error;
  }

  // In a real system, we'd check the password hash here
  // For mock, we'll just accept any password for existing users

  // Create session
  saveSession(user);

  return user;
};

// Mock logout function
export const mockLogoutUser = async (): Promise<void> => {
  saveSession(null);
};

// Get current user
export const mockGetCurrentUser = (): MockUser | null => {
  return getCurrentSession();
};

// Subscribe to auth state changes
export const mockOnAuthStateChanged = (callback: (user: MockUser | null) => void) => {
  // Initial call
  callback(getCurrentSession());

  // Set up listener for changes
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'php_mock_session') {
      callback(getCurrentSession());
    }
  };

  window.addEventListener('storage', handleStorage);

  // Return unsubscribe function
  return () => {
    window.removeEventListener('storage', handleStorage);
  };
};

// Get all users (for admin panel)
export const mockGetAllUsers = (): MockUser[] => {
  return getUsers();
};

// Get user profile
export const mockGetUserProfile = async (uid: string): Promise<MockUser | null> => {
  const users = getUsers();
  return users.find(u => u.uid === uid) || null;
};

// Check if we should use mock auth (if Firebase fails)
let useMockAuth = false;

export const setUseMockAuth = (value: boolean) => {
  useMockAuth = value;
};

export const shouldUseMockAuth = () => useMockAuth;

// Add some demo users for testing
export const seedDemoUsers = () => {
  const users = getUsers();
  if (users.length === 0) {
    const demoUsers: MockUser[] = [
      {
        uid: 'demo-001',
        email: 'admin@prohealth.com',
        firstName: 'Admin',
        lastName: 'User',
        createdAt: Timestamp.fromDate(new Date('2024-01-15'))
      },
      {
        uid: 'demo-002',
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: Timestamp.fromDate(new Date('2024-03-10'))
      },
      {
        uid: 'demo-003',
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        createdAt: Timestamp.fromDate(new Date('2024-03-12'))
      }
    ];
    saveUsers(demoUsers);
  }
};

// Initialize demo data on load
seedDemoUsers();
