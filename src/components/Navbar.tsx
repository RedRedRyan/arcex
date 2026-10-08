import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Link, NavLink } from "react-router-dom";
import { ConnectKitButton } from "connectkit";
import { formatAddress } from "../utils";

import { navLinks } from "../constants";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const Navbar = () => {
  useGSAP(() => {
    const navTween = gsap.timeline({
      scrollTrigger: {
        trigger: "nav",
        start: "bottom top",
      },
    });

    navTween.fromTo(
      "nav",
      { backgroundColor: "transparent" },
      {
        backgroundColor: "#00000050",
        backdropFilter: "blur(10px)",
        duration: 1,
        ease: "power1.inOut",
      },
    );
  });

  return (
    <nav>
      <div>
        <Link to="/" className="flex items-center gap-2">
          <img src="/images/logo.png" alt="logo" />
          <p>NBX</p>
        </Link>

        <ul>
          {navLinks.map((link) => (
            <li key={link.path}>
              <NavLink
                to={link.path}
                end={link.path === "/"}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {link.title}
              </NavLink>
            </li>
          ))}
        </ul>
        <ConnectKitButton.Custom>
          {({ isConnected, show, address, isConnecting }) => (
            <button
              onClick={show}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: isConnected
                  ? "var(--surface-strong)"
                  : "var(--accent)",
                color: isConnected ? "var(--ink)" : "#fff",
                border: isConnected ? "1px solid var(--border)" : "none",
              }}
            >
              {isConnecting
                ? "Connecting..."
                : isConnected && address
                  ? formatAddress(address)
                  : "Connect Wallet"}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </nav>
  );
};

export default Navbar;
