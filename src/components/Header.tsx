import React from "react";
import { Link } from "react-router-dom";
import NavItems from "./NavItems";
import UserDropdown from "./UserDropdown";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const Header = () => {
  useGSAP(() => {
    const navTween = gsap.timeline({
      scrollTrigger: {
        trigger: "header",
        start: "bottom top",
      },
    });

    navTween.fromTo(
      "header",
      { backgroundColor: "transparent" },
      {
        backgroundColor: "#00000050",
        backgroundFilter: "blur(10px)",
        duration: 1,
        ease: "power1.inOut",
      },
    );
  });
  return (
    <header className="sticky top-0 header">
      <div className="container header-wrapper">
        <Link to="/" aria-label="NBX home">
          <img
            src="/assets/icons/logo.jpg"
            alt="NBX"
            width={140}
            height={32}
            className="h-8 w-auto"
          />
        </Link>
        <nav className="header-nav hidden sm:block">
          <NavItems />
        </nav>
        <UserDropdown />
      </div>
    </header>
  );
};

export default Header;
