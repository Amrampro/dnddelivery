import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "../../src/workspace/WorkspaceScreen";
export default function ModuleScreen() {
  const { module } = useLocalSearchParams<{ module: string }>();
  return (
    <WorkspaceScreen
      moduleId={typeof module === "string" ? module : "unknown"}
    />
  );
}
