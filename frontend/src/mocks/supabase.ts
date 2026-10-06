// Offline stand-in for lib/supabase, used only when running `npm run dev:mock`.
const session = { user: { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Daven Chang' } } };

export const supabase = {
    auth: {
        getSession: async () => ({ data: { session } }),
        getUser: async () => ({ data: { user: session.user } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
        signInWithPassword: async () => ({ error: null }),
        signUp: async () => ({ data: { session }, error: null }),
        updateUser: async () => ({ data: { user: session.user }, error: null }),
    },
};
