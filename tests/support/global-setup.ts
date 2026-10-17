import { makeFixtures } from "../fixtures/make-fixtures";

export default async function setup(): Promise<void> {
  await makeFixtures();
}
