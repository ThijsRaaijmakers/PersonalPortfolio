# Thijs Raaijmakers — Software & AI Architecture

[![Astro](https://img.shields.io/badge/Astro-7.1-FF5D01?style=flat-square&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> **Live Production:** [thijsraaijmakers.me](https://thijsraaijmakers.me)

This repository houses my professional portfolio and functions as a secure engineering sandbox for logistical automation and data-processing projects. Built with a strict focus on performance, responsive UI/UX, and watertight access control.

---

## ⚡ Core Architecture & Features

This system is built using a decoupled architecture, separating a lightning-fast static frontend from a secure, relational backend.

### 🛡️ Secure Identity & Access Management (IAM)
* **Zero-Trust Authentication:** Powered by Supabase GoTrue with mandatory 6-digit Email OTP verification (routed via Resend SMTP).
* **Role-Based Access Control (RBAC):** Postgres Row Level Security (RLS) policies enforce strict data isolation between `admin`, `user`, and `guest` roles.
* **Protected Routing:** Client-side and server-side route guards prevent unauthorized access to internal management dashboards.

### ⚙️ Automated Logistical Systems
* **FleetPort Car Hiker Tracker:** A custom-built web application to automate driver logistics and shift management.
* **Dutch RDW API Integration:** Real-time retrieval of official vehicle specifications and metadata via automated license plate queries.
* **Deterministic Regex Parsing:** An automated pattern-matching engine that reliably extracts shift logs and logistical data directly from dispatch emails.

### 🎨 Modern Frontend & UX
* **Mobile-First Design:** Fluid, responsive grids built exclusively with Tailwind CSS v4.
* **Dynamic Overlay Navigation:** Absolute-positioned, smoothly animated dropdown overlays utilizing discrete transition scaling.
* **State Management:** Persistent dark/light mode toggling via `localStorage` and seamless English/Dutch (NL) internationalized routing.

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | Astro | Core static site generation and component islands. |
| **Styling** | Tailwind CSS v4 | Utility-first CSS, utilizing native CSS variables and modern layout primitives. |
| **Language** | TypeScript | Strict type-safety across API payloads and DOM interactions. |
| **Backend & DB** | Supabase | PostgreSQL database with strict RLS and real-time triggers. |
| **Authentication** | Supabase Auth | OTP-based email verification paired with secure session tokens. |
| **Email Delivery** | Resend | Custom SMTP configuration with verified DKIM/SPF/DMARC records. |

---

## 🚀 Local Development Setup

To run this project locally, ensure you have **Node.js (>=22.12.0)** installed.

### 1. Clone the repository
```bash
git clone [https://github.com/ThijsRaaijmakers/PersonalPortfolio.git](https://github.com/ThijsRaaijmakers/PersonalPortfolio.git)
cd PersonalPortfolio
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory and add your Supabase credentials:
```env
PUBLIC_SUPABASE_URL="[https://your-project-id.supabase.co](https://your-project-id.supabase.co)"
PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

### 4. Start the Development Server
```bash
npm run dev
```
The application will be available at `http://localhost:4321`.

---

## 🔐 Database Security Initialization

To set up the required tables and Role-Based Access Control, execute the following SQL in your Supabase SQL Editor:

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('admin', 'guest', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grant Admin Access (Run manually after registering)
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';
```

---

## 📄 License & Legal

* **Codebase:** MIT License - Free to use, modify, and distribute.
* **Privacy & Terms:** Logistical data processing and authentication flows are strictly governed by the [Terms of Service](/terms) and [Privacy Policy](/privacy).

<p align="center">
  <i>Engineered by Thijs Raaijmakers in Bergen op Zoom, NL.</i>
</p>