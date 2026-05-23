import { loadStripe } from '@stripe/stripe-js';

// Stripe publishable key — loaded from environment variable
// Safe to expose on frontend (publishable key, not secret key)
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;

// Singleton promise — only loads Stripe once across the app
export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
