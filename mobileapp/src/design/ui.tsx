import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "../../../shared/tokens";
const c = tokens.colors;
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        secondary && ui.secondary,
        danger && { backgroundColor: c.danger },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? c.navy : c.white} />}
      <Text style={[ui.buttonText, secondary && { color: c.navy }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <View style={ui.card}>{children}</View>;
}
export function Badge({
  children,
  success = false,
}: {
  children: string;
  success?: boolean;
}) {
  return (
    <View style={[ui.badge, success && { backgroundColor: c.softGreen }]}>
      <Text style={[ui.badgeText, success && { color: c.action }]}>
        {children}
      </Text>
    </View>
  );
}
export function Input({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        style={[ui.input, !!error && { borderColor: c.danger }]}
        placeholderTextColor={c.muted}
      />
      {!!error && (
        <Text role="alert" style={ui.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function EmptyState({
  title,
  description,
  icon = "inbox",
  children,
}: PropsWithChildren<{
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
}>) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyIcon}>
        <Feather name={icon} size={26} color={c.navy} />
      </View>
      <Text style={ui.emptyTitle}>{title}</Text>
      <Text style={ui.emptyDescription}>{description}</Text>
      {children}
    </View>
  );
}
export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <View style={ui.errorBox}>
      <Feather name="alert-circle" color={c.danger} size={23} />
      <Text role="alert" style={ui.error}>
        {message}
      </Text>
      {retry && <Button title="Réessayer" secondary onPress={retry} />}
    </View>
  );
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement"
      style={ui.stack}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={ui.skeleton} />
      ))}
    </View>
  );
}
export function Loading() {
  return (
    <View style={ui.empty}>
      <ActivityIndicator
        color={c.navy}
        accessibilityLabel="Chargement de votre espace"
      />
      <Text style={ui.body}>Vérification de votre accès…</Text>
      <Skeleton />
    </View>
  );
}
export function Sheet({
  open,
  onClose,
  title,
  children,
  centered = false,
  scroll = true,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  centered?: boolean;
  scroll?: boolean;
}>) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          ui.backdrop,
          centered && { justifyContent: "center", padding: 24 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le panneau"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            ui.sheet,
            { paddingBottom: Math.max(24, insets.bottom + 12) },
            centered && { borderRadius: 20 },
          ]}
        >
          <View style={ui.sheetTitle}>
            <Text role="heading" style={ui.sectionTitle}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={onClose}
              style={ui.iconButton}
            >
              <Feather name="x" size={22} color={c.navy} />
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={ui.stack}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ flexShrink: 1, gap: 12 }}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  busy?: boolean;
}) {
  return (
    <Sheet centered open={open} onClose={onClose} title={title}>
      <Text style={ui.body}>{description}</Text>
      <Button danger busy={busy} title="Confirmer" onPress={onConfirm} />
      <Button secondary title="Annuler" onPress={onClose} />
    </Sheet>
  );
}
export function ListRow({
  title,
  description,
  icon = "chevron-right",
  onPress,
  trailing,
  selected,
}: {
  title: string;
  description?: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  trailing?: ReactNode;
  selected?: boolean;
}) {
  const content = (
    <>
      <View style={ui.rowIcon}>
        <Feather name={icon} size={20} color={c.navy} />
      </View>
      <View style={ui.rowCopy}>
        <Text style={ui.rowTitle}>{title}</Text>
        {!!description && <Text style={ui.rowDescription}>{description}</Text>}
      </View>
      {trailing ??
        (onPress && <Feather name="chevron-right" size={17} color={c.muted} />)}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected===undefined?undefined:{selected}}
      onPress={onPress}
      style={({ pressed }) => [
        ui.row,
        pressed && { backgroundColor: c.background },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={ui.row}>{content}</View>
  );
}
export function Selector({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; description?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${options.find((o) => o.id === value)?.label ?? "Choisir"}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={ui.selector}
      >
        <View style={ui.rowCopy}>
          <Text style={ui.kicker}>{label}</Text>
          <Text style={ui.rowTitle} numberOfLines={1}>
            {options.find((o) => o.id === value)?.label ?? "Choisir"}
          </Text>
        </View>
        <Feather name="chevron-down" size={18} color={c.navy} />
      </Pressable>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        scroll={false}
      >
        {options.length > 12 && (
          <Input
            label={`Rechercher dans ${label}`}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        )}
        <FlatList
          style={{
            minHeight: Math.min(240, options.length * 64),
            maxHeight: 360,
          }}
          data={options.filter((o) =>
            `${o.label} ${o.description ?? ""}`
              .toLocaleLowerCase("fr-FR")
              .includes(search.toLocaleLowerCase("fr-FR")),
          )}
          keyExtractor={(o) => o.id}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={ui.body}>Aucun choix correspondant.</Text>
          }
          renderItem={({ item: o }) => (
            <ListRow
              key={o.id}
              selected={o.id===value}
              title={o.label}
              description={o.description}
              icon={o.id === value ? "check-circle" : "circle"}
              onPress={() => {
                setOpen(false);
                onChange(o.id);
              }}
            />
          )}
        />
      </Sheet>
    </>
  );
}
export function Checkbox({
  label,
  checked,
  onPress,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onPress?: () => void;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        onPress?.();
        onChange?.(!checked);
      }}
      style={ui.row}
    >
      <Text style={ui.body}>
        {checked ? "✓" : "○"} {label}
      </Text>
    </Pressable>
  );
}
export function CurrencyInput({
  currency,
  label,
  onChangeText,
  ...props
}: TextInputProps & { label: string; currency?: string }) {
  return (
    <Input
      {...props}
      label={currency ? `${label} (${currency})` : label}
      keyboardType="decimal-pad"
      autoCorrect={false}
      onChangeText={(value) => onChangeText?.(value.replace(",", "."))}
    />
  );
}
export function OtpInput(
  props: Omit<TextInputProps, "keyboardType" | "maxLength" | "label"> & {
    label?: string;
  },
) {
  return (
    <Input
      {...props}
      label={props.label ?? "Code de remise à six chiffres"}
      keyboardType="number-pad"
      maxLength={6}
      autoCorrect={false}
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
    />
  );
}
export function Summary({
  label,
  value = "—",
  hint,
}: {
  label: string;
  value?: string;
  hint?: string;
}) {
  return (
    <View style={ui.summary}>
      <Text style={ui.summaryLabel}>{label}</Text>
      <Text style={ui.summaryValue}>{value}</Text>
      <Text style={ui.summaryHint}>
        {hint ??
          (value === "—" ? "Aucune donnée chargée" : "Votre environnement")}
      </Text>
    </View>
  );
}
export function Detail({
  entries,
}: {
  entries: { label: string; value: string }[];
}) {
  return (
    <Card>
      {entries.map((e) => (
        <View key={e.label} style={ui.detailRow}>
          <Text style={ui.body}>{e.label}</Text>
          <Text style={ui.rowTitle}>{e.value}</Text>
        </View>
      ))}
    </Card>
  );
}
export const ui = StyleSheet.create({
  stack: { gap: tokens.spacing.lg },
  card: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: tokens.radius.lg,
    padding: 20,
    gap: 16,
  },
  button: {
    backgroundColor: c.action,
    borderRadius: tokens.radius.md,
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
  },
  buttonText: { color: c.white, fontSize: 14, fontWeight: "600" },
  badge: {
    backgroundColor: c.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeText: { color: c.muted, fontSize: 11, fontWeight: "600" },
  field: { gap: 8 },
  label: { color: c.text, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 15,
    minHeight: 50,
    fontSize: 16,
    color: c.text,
  },
  body: { color: c.muted, fontSize: 14, lineHeight: 23 },
  error: { color: c.danger, fontSize: 14, lineHeight: 23 },
  errorBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0D6DC",
    backgroundColor: "#FFF7F8",
    gap: 15,
  },
  empty: { padding: 24, alignItems: "center", gap: 14 },
  emptyIcon: {
    width: 58,
    height: 58,
    backgroundColor: c.background,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: c.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDescription: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
  },
  skeleton: {
    height: 65,
    borderRadius: 12,
    backgroundColor: "#E9EEF5",
    minWidth: 200,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#102B4F77",
  },
  sheet: {
    backgroundColor: c.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
    gap: 20,
  },
  sheetTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { color: c.text, fontSize: 18, fontWeight: "600" },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    minHeight: 62,
  },
  rowIcon: {
    width: 42,
    height: 42,
    backgroundColor: c.background,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: c.text, fontSize: 14, fontWeight: "600" },
  rowDescription: { color: c.muted, fontSize: 12, lineHeight: 19 },
  selector: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: c.muted,
    textTransform: "uppercase",
  },
  summary: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 18,
    gap: 11,
  },
  summaryLabel: { fontSize: 12, lineHeight: 18, color: c.muted },
  summaryValue: { fontSize: 28, fontWeight: "600", color: "#8A9BB1" },
  summaryHint: { fontSize: 9, color: c.muted },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 10,
  },
});
