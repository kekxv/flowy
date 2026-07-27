import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const store = useAuthStore();
  const fetchCalled = useRef(false);

  useEffect(() => {
    if (store.isLoading && !fetchCalled.current) {
      fetchCalled.current = true;
      store.fetchUser();
    }
  }, [store.isLoading]);

  return store;
}
