/**
 * /events/new — Instructor form to create a new event.
 *
 * On save we submit to the backend which geocodes the address via
 * Nominatim. If geocoding fails the event still saves — it just won't
 * appear in distance-based searches until the address is corrected.
 */
import { useCallback, useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { api, EventInput } from "@/src/api/client";
import { EventForm } from "@/src/components/EventForm";

export default function NewEventScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [catalog, setCatalog] = useState<{
    types: string[];
    skill_levels: string[];
  }>({ types: [], skill_levels: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getEventTypesCatalog(token).then(setCatalog).catch(() => {});
  }, [token]);

  const onSubmit = useCallback(
    async (payload: EventInput) => {
      if (!token) return;
      setBusy(true);
      try {
        const created = await api.createEvent(token, payload);
        router.replace(`/events/${created.id}`);
      } catch (e: any) {
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [token, router]
  );

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <EventForm
            mode="create"
            initial={null}
            catalog={catalog}
            onSubmit={onSubmit}
            submitting={busy}
            onCancel={() => router.back()}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
