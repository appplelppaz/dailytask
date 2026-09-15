// The pictures the painting engine knows how to make.
import { subject as stillLife } from './still-life.js';
import { subject as starryNight } from './starry-night.js';

export const SUBJECTS = {
  [stillLife.id]: stillLife,
  [starryNight.id]: starryNight
};

export const SUBJECT_LIST = Object.values(SUBJECTS);
