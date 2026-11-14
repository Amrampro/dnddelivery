import { Input } from "./ui";
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label={`${label} (facultatif)`}
      value={value}
      onChangeText={onChange}
      placeholder="2026-10-29T15:30 ou date ISO"
      autoCapitalize="none"
    />
  );
}
