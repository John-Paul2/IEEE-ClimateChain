import React from "react";
import { Chip, type ChipProps, type ChipVariant } from "./Chip";

export type BadgeVariant = ChipVariant;
export type BadgeProps = ChipProps;

export const Badge: React.FC<BadgeProps> = (props) => {
  return <Chip {...props} />;
};

export default Badge;
