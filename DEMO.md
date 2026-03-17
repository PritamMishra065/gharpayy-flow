# Gharpayy Demo Guide & Feature Log

Welcome to the Gharpayy demo! This guide details the actively developed features and walks you through how to log in with test credentials, explore the app, and test the new Razorpay payment integration safely.

## ✨ Recently Implemented Features & Fixes

Our newest deployment includes several key upgrades requested by the team:

- **Razorpay Secure Checkout Integration 💳:** Full payment gateway integration using Supabase Edge Functions. End-to-end support for processing Pre-Booking payments.
- **Native Google Authentication 🔑:** Fixed broken third-party auth module loops by migrating "Continue with Google" directly to Supabase Native Auth Client on Sign In & Sign Up pages.
- **Owner Dashboard Enhancements 🏢:** Property owners can now explicitly upload multiple property photos, define specific Rooms, and manage individual Beds inside those rooms.
- **Instant Property Exploration 🗺️:** Resolved an issue where newly added properties from the Owner dashboard were not synchronizing correctly; they are now immediately visible on the public Explore page.
- **Admin Lead Generation Fix 🛠️:** Resolved a critical "Maximum Call Stack Size Exceeded" error that occurred when manually creating leads in the Admin dashboard.

---

## 1. Demo Credentials

You can use the following demo accounts to explore different roles within the application:

### Customer Account
*   **Email:** `customer@example.com`
*   **Password:** `password123`
*   **Role:** User looking for properties, can pre-book beds and chat.

### Owner Account
*   **Email:** `owner@example.com`
*   **Password:** `password123`
*   **Role:** Property Owner, can manage listings and view leads.

### Admin Account
*   **Email:** `admin@example.com`
*   **Password:** `password123`
*   **Role:** Super Admin, can manage all users, verify properties, and view analytics.

*(Note: Depending on the current state of your Supabase database, you might need to sign up with these emails first and set their roles in the database if they don't already exist).*

---

## 2. Exploring the App & Pre-Booking

As a **Customer**:
1. Go to the **Explore** page (`/explore`).
2. Click on any property to view its details (`/property/:id`).
3. Scroll down to the **Available Rooms** section.
4. Select a specific **Room** and click on a **Vacant Bed** (e.g., Bed 1).
5. On the right-side summary card, click **Pre-Book Now — ₹1,000**.
6. Fill in the Booking Details (Name, Phone, Move-in Date).
7. Click **Reserve Bed — ₹1,000**.

---

## 3. Testing Razorpay Payments

Once you reserve a bed, you will be prompted to complete the payment.

1. Click the **Pay ₹1,000 Securely** button. This will open the Razorpay Checkout Modal.
2. In the Razorpay modal, enter any dummy phone number (e.g., `9999999999`) and email.
3. Choose your preferred test payment method:

### Option A: Testing via UPI (Recommended & Fastest)
*   Select **UPI** as the payment method.
*   Click on **Pay via UPI ID**.
*   Enter the official test UPI ID: `success@razorpay`
*   Click **Pay Now**.
*   *Result: The payment will instantly succeed.*

### Option B: Testing via Netbanking
*   Select **Netbanking** as the payment method.
*   Choose any bank from the list (e.g., SBI, HDFC).
*   Click **Pay Now**.
*   A new simulator window/tab will open. Click the **Success** button in that window.
*   *Result: The payment will be marked as successful.*

### Option C: Testing via Card
*(Note: Some new Razorpay accounts have international cards disabled by default in test mode, which may cause card errors. If so, use UPI instead).*
*   Select **Card**.
*   Enter the test card details:
    *   **Card Number:** `4111 1111 1111 1111`
    *   **Expiry:** Any future date (e.g., `12/26`)
    *   **CVV:** Any 3 digits (e.g., `111`)
    *   **OTP:** Any OTP (e.g., `1234`)
*   Click **Pay Without Saving**.
*   *Result: The payment will succeed.*

---

## 4. Verification

After a successful simulated payment, the Razorpay modal will automatically close. 
You will see a green success toast saying **"Booking confirmed! Our team will contact you shortly."**

If you look at your Supabase `bookings` table, the reservation will be recorded with the generated `razorpay_payment_id` serving as the confirmation reference!
