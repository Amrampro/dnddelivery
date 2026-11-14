import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Sheet, ui } from "./ui";
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState<"date" | "time" | null>(null),
    [draft, setDraft] = useState(new Date());
  return (
    <View style={ui.stack}>
      <Text style={ui.label}>{label}</Text>
      <Button
        secondary
        title={
          value && Number.isFinite(Date.parse(value))
            ? new Date(value).toLocaleString("fr-FR")
            : "Choisir une date et une heure"
        }
        onPress={() => {
          setDraft(
            value && Number.isFinite(Date.parse(value))
              ? new Date(value)
              : new Date(),
          );
          setOpen("date");
        }}
      />
      {!!value && (
        <Button
          secondary
          title="Retirer la date souhaitée"
          onPress={() => onChange("")}
        />
      )}
      {Platform.OS === "ios" ? (
        <Sheet open={!!open} title={label} onClose={() => setOpen(null)}>
          <DateTimePicker
            value={draft}
            mode="datetime"
            display="spinner"
            onChange={(_event, date) => {
              if (date) setDraft(date);
            }}
          />
          <Button
            title="Utiliser cette date"
            onPress={() => {
              onChange(draft.toISOString());
              setOpen(null);
            }}
          />
        </Sheet>
      ) : (
        open && (
          <DateTimePicker
            key={open}
            value={draft}
            mode={open}
            is24Hour
            onChange={(event, date) => {
              if (event.type !== "set" || !date) {
                setOpen(null);
                return;
              }
              if (open === "date") {
                const next = new Date(date);
                next.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
                setDraft(next);
                setOpen("time");
              } else {
                const next = new Date(draft);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                onChange(next.toISOString());
                setOpen(null);
              }
            }}
          />
        )
      )}
    </View>
  );
}
