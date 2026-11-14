import { Outlet } from "react-router-dom";
/** The landing retains its public navigation and original composition. */
export function PublicLayout() {
  return (
    <div className="public-layout">
      <Outlet />
    </div>
  );
}
