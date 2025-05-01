import { useAuth } from "@/components/AuthProvider";
// @ts-ignore
import { useRouter } from "expo-router";

export const useRequireAuth = () => {
  const { session } = useAuth();
  const router = useRouter();

  return (callback: () => void) => {
    if (session) callback();
    else router.push("/auth");
  };
};
