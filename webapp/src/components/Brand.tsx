import { Link } from "react-router-dom";
export function Brand() {
  return (
    <Link to="/" aria-label="DND Delivery, accueil" className="brand">
      <img
        src="/logo%20long.jpg"
        alt="DND Delivery — Plus proches de vos clients"
        width="695"
        height="163"
      />
    </Link>
  );
}
