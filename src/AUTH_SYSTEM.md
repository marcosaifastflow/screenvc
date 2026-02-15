# ScreenVC Authentication System

## Overview

ScreenVC now has a complete authentication system where users must sign up and log in to create and manage forms. All forms are associated with the authenticated user and stored in Supabase.

## Features

### ✅ User Authentication
- **Sign Up**: Create a new account with email, password, and optional name
- **Login**: Authenticate with email and password
- **Session Management**: Automatic session persistence across page reloads
- **Logout**: Secure logout that clears session

### ✅ Form Ownership
- Each form is associated with a specific user (userId)
- Users can only publish forms when authenticated
- Forms are stored in Supabase with user ownership data
- Form submissions are linked to the original form

### ✅ Protected Routes
- `/builder` and `/dashboard` routes require authentication
- Unauthenticated users are redirected to the login/signup page
- Public form URLs (`/?form=formId`) remain accessible to everyone

## Architecture

```
User Authentication Flow:
1. User signs up → Backend creates user with Supabase Auth
2. User logs in → Frontend receives access token
3. Access token stored in React state
4. Token used for all authenticated API calls
5. Session persisted via Supabase Auth

Form Publishing Flow:
1. User creates form in builder (requires auth)
2. User publishes form → API call with access token
3. Backend verifies token and stores form with userId
4. Unique form ID generated and link created
5. Form accessible via public URL (no auth required for viewing)
6. Submissions linked to form ID
```

## Technical Implementation

### Backend Routes

#### Auth Routes
- `POST /auth/signup` - Create new user account
  - Creates user with Supabase Auth admin API
  - Stores user info in KV store
  - Auto-confirms email (no email server configured)

#### Form Routes (Protected)
- `POST /forms/publish` - Publish form (requires auth)
  - Validates access token
  - Associates form with userId
  - Generates unique form ID
  - Invalidates old form if republishing

- `GET /forms` - Get all forms for authenticated user
  - Returns list of user's forms
  - Requires valid access token

#### Form Routes (Public)
- `GET /forms/:formId` - Get public form (no auth)
- `POST /forms/:formId/submit` - Submit form (no auth)

### Frontend Components

#### AuthPage (`/components/AuthPage.tsx`)
- Tabbed interface for Login/Signup
- Form validation
- Error handling with toast notifications
- Auto-redirects to builder after successful auth

#### Updated Components
- **FormBuilder**: Now shows user email and logout button
- **EmbedCode**: Uses access token for publishing
- **App.tsx**: Manages auth state and protected routing

### Data Storage

#### User Data Structure
```typescript
{
  id: string;              // Supabase user ID
  email: string;
  name: string;
  createdAt: string;
}
```

#### Form Data Structure (Updated)
```typescript
{
  formId: string;
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
  userId: string;          // NEW: Owner of the form
  publishedAt: string;
  status: 'active' | 'inactive';
}
```

## User Flows

### New User Flow
1. Click "Get Started" on landing page
2. Redirected to auth page
3. Click "Sign Up" tab
4. Enter email, password, name
5. Submit → Account created
6. Auto-logged in and redirected to form builder
7. User email shown in header

### Returning User Flow
1. Navigate to `/builder` or click "Get Started"
2. Session automatically restored if valid
3. If no session, redirected to auth page
4. Login with credentials
5. Redirected to form builder

### Form Publishing Flow (Authenticated)
1. User builds form in builder
2. Navigate to "Publish" tab
3. Toggle "Draft" to "Published"
4. Backend validates access token
5. Form stored with userId
6. Unique shareable link generated
7. Link accessible to anyone (no auth needed to view/submit)

### Logout Flow
1. Click "Logout" button in header
2. Supabase session cleared
3. Auth state reset
4. Redirected to landing page

## Security Notes

### ⚠️ Important Limitations
- **Not for PII**: Figma Make is not designed for sensitive data
- **Email Confirmation**: Auto-confirms emails (no email server)
- **Session Storage**: Sessions stored in browser localStorage
- **Production Use**: Implement proper security measures before production

### What's Protected
- ✅ Form creation/publishing requires authentication
- ✅ Access tokens validated on server
- ✅ Users can only invalidate their own forms
- ✅ Service role key never exposed to frontend

### What's Public
- ❌ Published forms accessible via link (by design)
- ❌ Form submissions (founders don't need accounts)
- ❌ Public form viewing

## Testing the System

### Test User Creation
```bash
# Sign up with:
Email: test@screenvc.com
Password: password123
Name: Test VC
```

### Test Flow
1. Sign up new account
2. Build a form
3. Publish the form
4. Copy the shareable link
5. Open link in incognito (no auth needed to view)
6. Submit the form
7. Logout and verify redirect
8. Login again and verify form still exists

## API Integration

### Frontend API Calls

```typescript
// Sign up
await signup({ email, password, name });

// Login (via Supabase client)
await supabase.auth.signInWithPassword({ email, password });

// Publish form (requires access token)
await publishForm({
  formName,
  questions,
  thesis,
  accessToken // From auth state
});

// Get user's forms
await getUserForms(accessToken);
```

## Environment Variables

No additional environment variables needed! The system uses:
- `SUPABASE_URL` (already configured)
- `SUPABASE_SERVICE_ROLE_KEY` (already configured)
- `SUPABASE_ANON_KEY` (already configured)

## Future Enhancements

Potential improvements:
- Email verification with real email service
- Password reset functionality
- Social login (Google, GitHub, etc.)
- User profile management
- Form sharing/collaboration
- Team accounts
- Analytics dashboard per user
- Form templates
