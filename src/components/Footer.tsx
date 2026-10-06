import React from "react";
import { socials } from "@/constants";

const Footer = () => {
  return (
    <footer className="border-t border-[#2e2922]">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_1.2fr] md:items-end lg:px-12">
        <div>
          <p className="font-serif text-2xl">Nairobi Block Exchange</p>
          <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#9a9184]">
            Tokenized money market fund infrastructure
          </p>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-[#9a9184] md:justify-self-end">
          NBX is a distribution and token-administration platform for approved
          money market funds. It is not the fund manager, appointed approver,
          custodian, or investment adviser, and it does not hold client money.
          Illustrative figures are not execution prices.
        </p>
        <div className="flex flex-row gap-5">
          {socials.map((social) => (
            <a
              key={social.name}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.name}
            >
              <img src={social.icon} className="size-10" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
};
export default Footer;
