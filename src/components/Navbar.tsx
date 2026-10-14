import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Link, NavLink } from "react-router-dom";
import { DynamicNav } from "@dynamic-labs/sdk-react-core";
import WalletButton from "./WalletButton";

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
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                {link.title}
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Dynamic's own network switcher — lists every network registered in
            overrides.evmNetworks (Arc Testnet, Arc Mainnet, Ethereum, Base).
            It renders nothing until a wallet is connected. */}
        <div className="dynamic-nav-slot">
          <DynamicNav />
        </div>
        <WalletButton />
      </div>
    </nav>
  );
};

export default Navbar;
