/**
 * Config plugin — bump the Gradle JVM heap for Android builds.
 *
 * Why:
 * The Kotlin compiler for `expo-updates`'s Gradle plugin (Kotlin
 * 2.1.20) plus RN 0.81's build graph can OOM the default 2 GiB heap
 * that the EAS worker inherits. Support recommended raising it to
 * `-Xmx4g` for the Android app-bundle build.
 *
 * `expo-build-properties` doesn't (as of 1.0.10) expose a knob for
 * arbitrary `gradle.properties` overrides, so we ship this tiny
 * local plugin instead. It uses the officially supported
 * `withGradleProperties` mod from `@expo/config-plugins` — same
 * mechanism EAS Prebuild itself uses.
 *
 * We DELETE any pre-existing `org.gradle.jvmargs` line first so we
 * don't leave two conflicting entries in `gradle.properties`, and
 * we always append the exact value we want, keyed so that a repeat
 * `prebuild` is idempotent.
 *
 * The plugin has no runtime dependency: it only mutates the Android
 * project scaffolding during the prebuild step of the EAS build.
 */
const { withGradleProperties } = require("@expo/config-plugins");

const JVM_ARGS_KEY = "org.gradle.jvmargs";
// -Xmx4g is what support recommended; -XX:MaxMetaspaceSize=512m is a
// paired safeguard so metaspace doesn't creep up over the 4 GiB heap
// during the Kotlin compile.
const JVM_ARGS_VALUE = "-Xmx4g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8";

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (mod) => {
    // Drop any existing jvmargs line (both the property and the
    // comment right above it, if any) so we don't stack duplicates.
    const filtered = [];
    for (let i = 0; i < mod.modResults.length; i++) {
      const entry = mod.modResults[i];
      if (entry.type === "property" && entry.key === JVM_ARGS_KEY) {
        continue;
      }
      filtered.push(entry);
    }

    // Append a clearly-labelled block so future maintainers can
    // grep for it.
    filtered.push({
      type: "comment",
      value:
        " Managed by plugins/with-gradle-heap.js — bumps Gradle heap for the Kotlin 2.1.20 build.",
    });
    filtered.push({
      type: "property",
      key: JVM_ARGS_KEY,
      value: JVM_ARGS_VALUE,
    });

    mod.modResults = filtered;
    return mod;
  });
};
