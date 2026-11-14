import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme";
export function Field({
  label,
  password = false,
  ...props
}: TextInputProps & { label: string; password?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 9 }}>
      <Text style={form.label}>{label}</Text>
      <View style={form.inputRow}>
        <TextInput
          accessibilityLabel={label}
          {...props}
          style={form.input}
          secureTextEntry={password && !visible}
          placeholderTextColor={colors.muted}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
            }
            onPress={() => setVisible(!visible)}
            style={form.eye}
          >
            <Feather
              name={visible ? "eye-off" : "eye"}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}
export const form = StyleSheet.create({
  title: {
    fontSize: 35,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.navy,
  },
  text: { fontSize: 15, lineHeight: 25, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  inputRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
  },
  input: {
    padding: 17,
    fontSize: 16,
    color: colors.navy,
    flex: 1,
    minHeight: 56,
  },
  eye: {
    width: 48,
    minHeight: 54,
    justifyContent: "center",
    alignItems: "center",
  },
  error: { fontSize: 14, lineHeight: 23, color: "#A62431" },
  success: { fontSize: 14, lineHeight: 23, color: "#078046" },
  link: { fontSize: 14, color: colors.navy, paddingVertical: 10 },
  card: {
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "white",
    gap: 8,
  },
  small: { fontSize: 12, lineHeight: 20, color: colors.muted },
});
