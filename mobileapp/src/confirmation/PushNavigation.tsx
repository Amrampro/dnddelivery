import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../auth/client";
import { synchronizePushDevice } from "./push-device";
import {
  notificationTarget,
  notificationModule,
  type NotificationTarget,
} from "./notification-target";
import type { Workspace } from "../auth/types";
export function PushNavigation() {
  const router = useRouter(),
    auth = useAuth();
  const [pending, setPending] = useState<NotificationTarget>();
  const attempted = useRef("");
  const userId = auth.profile?.user.id;
  const contextSnapshot = JSON.stringify(auth.profile?.activeContext ?? null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let live = true;
    const removers: Array<() => void> = [];
    void import("expo-notifications")
      .then((n) => {
        if (!live) return;
        n.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const open = (
          response: import("expo-notifications").NotificationResponse,
        ) => {
          const target = notificationTarget(
            response.notification.request.content.data,
          );
          n.clearLastNotificationResponse();
          attempted.current = "";
          if (target) setPending(target);
          else router.push("/organisations");
        };
        const response = n.addNotificationResponseReceivedListener(open);
        removers.push(() => response.remove());
        const rotation = n.addPushTokenListener(() => {
          if (userId) void synchronizePushDevice(userId).catch(() => undefined);
        });
        removers.push(() => rotation.remove());
        const last = n.getLastNotificationResponse();
        if (last) open(last);
        if (userId) void synchronizePushDevice(userId).catch(() => undefined);
        const app = AppState.addEventListener("change", (state) => {
          if (state === "active" && userId)
            void synchronizePushDevice(userId).catch(() => undefined);
        });
        removers.push(() => app.remove());
      })
      .catch(() => undefined);
    return () => {
      live = false;
      for (const remove of removers) remove();
    };
  }, [router, userId]);
  useEffect(() => {
    if (!pending || auth.state !== "authenticated") return;
    const context = JSON.parse(contextSnapshot) as Workspace | null,
      key = `${userId}:${context?.key}:${JSON.stringify(pending)}`;
    if (attempted.current === key) return;
    attempted.current = key;
    const moduleId = context && notificationModule(pending, context);
    if (!moduleId) {
      router.push("/organisations");
      return;
    }
    let live = true;
    void api(
      pending.kind === "delivery"
        ? `/deliveries/${pending.id}`
        : "/financial-options",
    )
      .then(() => {
        if (live) {
          router.push({
            pathname: "/espace/[module]",
            params: {
              module: moduleId,
              ...(pending.kind === "delivery" ? { mission: pending.id } : {}),
            },
          });
          setPending(undefined);
        }
      })
      .catch(() => {
        if (live) router.push("/organisations");
      });
    return () => {
      live = false;
    };
  }, [pending, auth.state, contextSnapshot, userId, router]);
  return null;
}
