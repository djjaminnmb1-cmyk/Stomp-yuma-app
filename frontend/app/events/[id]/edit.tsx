/**
 * /events/[id]/edit — Instructor edit form.
 */
import { useCallback, useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { api, EventInput, EventItem } from "@/src/api/client";
import { EventForm } from "@/src/components/EventForm";
import { colors } from "@/src/theme";

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [catalog, setCatalog] = useState<{
    types: string[];
    skill_levels: string[];
  }>({ types: [], skill_levels: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    api.getEvent(token, String(id)).then(setEvent).catch(() => setEvent(null));
    api.getEventTypesCatalog(token).then(setCatalog).catch(() => {});
  }, [token, id]);

  const onSubmit = useCallback(
    async (payload: EventInput) => {
      if (!token || !id) return;
      setBusy(true);
      try {
        await api.updateEvent(token, String(id), payload);
        router.replace(`/events/${id}`);
      } finally {
        setBusy(false);
      }
    },
    [token, id, router]
  );

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <EventForm
            mode="edit"
            initial={event}
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
