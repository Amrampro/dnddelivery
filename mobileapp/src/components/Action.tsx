import { Pressable, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../theme";
export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        disabled && { opacity: 0.55 },
        secondary && styles.secondary,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.text, secondary && { color: colors.navy }]}>
        {title}
      </Text>
      <Feather
        name="arrow-up-right"
        size={19}
        color={secondary ? colors.navy : colors.white}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: colors.action,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { color: colors.white, fontSize: 15, fontWeight: "600", flexShrink: 1 },
});
