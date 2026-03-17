# Gharpayy Dashboard

## Overview
Gharpayy Dashboard is a comprehensive administration and management system built for Gharpayy. It provides a centralized web-based application to handle various operational aspects, including leads, inventory, properties, bookings, and user analytics.

## Features
- **Authentication & Authorization**: Secure login, signup, and password reset functionalities.
- **Analytics & Reporting**: Data-driven insights and historical logs for business performance metrics.
- **CRM Pipeline**: Track and capture leads, manage conversations, and handle visits.
- **Inventory & Property Management**: Detailed property tracking, matching, and zone management.
- **Owner Portals**: Dedicated interfaces for tracking availability, handling owners, and managing bookings.

## Technology Stack
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn-ui, Radix UI
- **State Management**: TanStack React Query
- **Backend & Database**: Supabase
- **Routing**: React Router

## Local Setup Instructions

Follow these steps to run the dashboard application on your local machine.

### Prerequisites
- Node.js
- npm (Node Package Manager)
- Git

### 1. Clone the Repository
Open your terminal and clone the repository:
```sh
git clone <YOUR_GIT_URL>
```

### 2. Navigate to the Project Directory
```sh
cd gharpayy-flow
```

### 3. Install Dependencies
Install all required packages:
```sh
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory of the project and add your Supabase credentials:
```env
VITE_SUPABASE_PROJECT_ID="your_project_id_here"
VITE_SUPABASE_PUBLISHABLE_KEY="your_publishable_key_here"
VITE_SUPABASE_URL="https://your_project_id_here.supabase.co"
```

### 5. Start the Development Server
Run the application in development mode:
```sh
npm run dev
```

### 6. Backend & Supabase Edge Functions Setup

This project utilizes Supabase Edge Functions for secure operations like **Razorpay Payments**. To run and test these functions locally or deploy them:

1. **Install Supabase CLI**:
   Ensure you have the Supabase CLI installed on your machine.
   ```sh
   npm install -g supabase
   ```
2. **Link Your Project**:
   ```sh
   supabase login
   supabase link --project-ref your_project_id_here
   ```
3. **Configure Edge Function Secrets**:
   The `create-razorpay-order` edge function requires Razorpay API credentials. Set these in your Supabase project vault:
   ```sh
   npx supabase secrets set RAZORPAY_KEY_ID="your_razorpay_key_id" RAZORPAY_KEY_SECRET="your_razorpay_key_secret"
   ```
4. **Deploy Edge Functions**:
   Deploy the function to your linked project, circumventing JWT requirements for public guest checkout:
   ```sh
   npx supabase functions deploy create-razorpay-order --no-verify-jwt
   ```

### 7. Razorpay Integration (Frontend)

To ensure the checkout flow works on your local environment, you must also add your test Razorpay Key ID to the `.env` file created in Step 4:

```env
VITE_RAZORPAY_KEY_ID="rzp_test_#####"
```

The application will launch and you can view it in your browser, typically at `http://localhost:8080` (or another port specified in the terminal output).
