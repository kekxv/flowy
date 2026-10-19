import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const store = useAuthStore();
  const { isLoading, fetchUser } = store;
  const fetchCalled = useRef(false);

  useEffect(() => {
    if (isLoading && !fetchCalled.current) {
      fetchCalled.current = true;
      void fetchUser();
    }
  }, [isLoading, fetchUser]);

  return store;
}
