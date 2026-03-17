import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

// Ensure we have RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in our environment
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || 'rzp_test_SSOOAxq5Rb09aC';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || 'fCVGHQJGb58OJqylcFIZtGnr';

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, receipt } = await req.json()

    if (!amount || !receipt) {
      throw new Error('Please provide both amount and receipt identifiers.')
    }

    // Razorpay expects amount in the smallest currency unit (paise for INR)
    // So multiply the flat amount by 100.
    const orderPayload = {
      amount: amount * 100, 
      currency: "INR",
      receipt: receipt,
      payment_capture: 1 // Auto-capture the payment
    };

    // Make the API request to Razorpay to create a new order
    const authHeaders = new Headers();
    authHeaders.set('Authorization', 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`));
    authHeaders.set('Content-Type', 'application/json');

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(orderPayload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Razorpay Error Response:', errorText);
      throw new Error('Failed to create Razorpay order');
    }

    const orderData = await res.json();
    console.log('Order Generated successfully:', orderData);

    // Return the generated order ID to the client
    return new Response(
      JSON.stringify(orderData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
