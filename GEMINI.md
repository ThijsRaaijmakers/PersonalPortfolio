# Project Context
This is a professional portfolio website for a Master's student in AI and Cybersecurity at Tilburg University.

# Tech Stack
*   **Framework:** Astro (latest)
*   **Styling:** Tailwind CSS
*   **Database (Future):** Supabase (PostgreSQL)

# Architectural Rules
1.  **Strict Component Separation:** The UI components must remain completely decoupled from backend logic.
2.  **Routing Structure:** 
    *   `/` (Homepage): Static personal information, academic background, and a summary of skills.
    *   `/projects`: A gallery listing all projects.
    *   `/projects/[slug]`: Dynamic routing for individual project pages (e.g., the Car Hiker Tracker).
3.  **UI/UX Guidelines:** The design must be modern, minimal, dark-mode default, and reflect a cybersecurity aesthetic (clean lines, monospace accents for technical details) without looking overly aggressive or "hacker-ish".
4.  **CLI Behavior:** Do not execute destructive shell commands (like deleting folders or resetting git history) without explicit confirmation.

### Authentication & Security Architecture
*   **Auth Provider:** Supabase Authentication is used for user authentication and session management.
*   **Role-Based Access Control (RBAC) Rules:**
    *   **Admin:** Has full read/write access to all tables (Identified by owner email address).
    *   **Authenticated Users / Guests:** Have read-only access to public portfolio data.
    *   **Unauthenticated Users:** Have read-only access to public portfolio data.
    *   **PRIVACY RULE:** Logistical, location, or schedule data related to the FleetPort tracker is STRICTLY restricted to Admin only.