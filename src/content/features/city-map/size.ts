import type { BoxOptions } from '../../ui/box';

/** 70 % of the window in each direction, at most 1100 x 850 pixels; the default size of the city map box */
export const largeDefaultSize: NonNullable<BoxOptions['defaultSize']> = (win) => ({
  width: Math.min(win.width * 0.7, 1100),
  height: Math.min(win.height * 0.7, 850),
});
