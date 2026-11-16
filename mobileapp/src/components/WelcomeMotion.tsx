import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";

/** Decorative only: motion never conveys delivery progress or blocks an action. */
export function WelcomeMotion({ compact }: { compact: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const preference = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        setReduceMotion(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && !changed) setReduceMotion(value);
      })
      .catch(() => {
        /* Keep the static illustration if the preference cannot be read. */
      });
    const state = AppState.addEventListener("change", (value) =>
      setActive(value === "active"),
    );
    return () => {
      mounted = false;
      preference.remove();
      state.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      phase.setValue(0);
      if (reduceMotion || !active) return;
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(phase, {
            toValue: 1,
            duration: 3000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(phase, {
            toValue: 0,
            duration: 3000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }, [active, phase, reduceMotion]),
  );

  const drift = phase.interpolate({ inputRange: [0, 1], outputRange: [3, -7] });
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[s.frame, compact && s.compact]}
    >
      <View style={[s.scene, compact && { transform: [{ scale: 0.82 }] }]}>
        <LinearGradient
          colors={["#E6F5EF", "#EDF3FC", "#F5F8FA"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.halo}
        />
        <View style={s.orbit} />
        <View style={s.route} />
        <Animated.View
          style={[
            s.shadow,
            {
              opacity: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [0.13, 0.06],
              }),
              transform: [
                {
                  scaleX: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.8],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            s.parcel,
            {
              transform: [
                // iOS can intersect the tilted layer with the background plane.
                // Keep its relief in the gradient/shadow and animate in 2D there.
                ...(Platform.OS === "ios" ? [] : [{ perspective: 600 }]),
                { translateY: drift },
                ...(Platform.OS === "ios" ? [] : [{ rotateX: "12deg" }]),
                {
                  rotateZ: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-9deg", "-3deg"],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={["#168E66", "#066546"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.parcelFace}
          >
            <View style={s.highlight} />
            <Feather name="package" size={48} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>
        <Animated.View
          style={[
            s.satellite,
            s.location,
            {
              transform: [
                {
                  translateY: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-3, 5],
                  }),
                },
                { rotate: "-8deg" },
              ],
            },
          ]}
        >
          <Feather name="map-pin" size={23} color={colors.navy} />
        </Animated.View>
        <Animated.View
          style={[
            s.satellite,
            s.truck,
            { transform: [{ translateY: drift }, { rotate: "8deg" }] },
          ]}
        >
          <Feather name="truck" size={25} color="#087B52" />
          <View style={s.badge}>
            <Feather name="check" size={10} color="#FFFFFF" />
          </View>
        </Animated.View>
        <Animated.View
          style={[
            s.dot,
            {
              transform: [
                {
                  translateX: phase.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 142],
                  }),
                },
                {
                  translateY: phase.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 13, 0],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={[s.spark, { left: 79, top: 22 }]} />
        <View
          style={[
            s.spark,
            {
              right: 49,
              bottom: 22,
              backgroundColor: "#A3C1E4",
              width: 5,
              height: 5,
            },
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { height: 160, alignItems: "center", justifyContent: "center" },
  compact: { height: 118 },
  scene: { width: 280, height: 160 },
  halo: {
    ...Platform.select({ ios: { zIndex: 0 } }),
    position: "absolute",
    width: 190,
    height: 136,
    borderRadius: 90,
    left: 45,
    top: 9,
  },
  orbit: {
    ...Platform.select({ ios: { zIndex: 0 } }),
    position: "absolute",
    left: 21,
    top: 25,
    width: 238,
    height: 111,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "#D9E8E6",
    transform: [{ rotate: "-15deg" }],
  },
  route: {
    ...Platform.select({ ios: { zIndex: 0 } }),
    position: "absolute",
    width: 178,
    height: 65,
    left: 51,
    top: 45,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#AECBC6",
    borderRadius: 38,
    transform: [{ rotate: "12deg" }],
  },
  parcel: {
    ...Platform.select({ ios: { zIndex: 2 } }),
    position: "absolute",
    left: 95,
    top: 29,
    width: 90,
    height: 90,
    borderRadius: 25,
    backgroundColor: "#07543E",
    paddingBottom: 6,
    shadowColor: "#064F3C",
    shadowOpacity: 0.19,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  parcelFace: {
    flex: 1,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#3AA583",
  },
  highlight: {
    position: "absolute",
    width: 110,
    height: 40,
    backgroundColor: "#FFFFFF14",
    top: -17,
    left: -20,
    transform: [{ rotate: "-25deg" }],
  },
  shadow: {
    ...Platform.select({ ios: { zIndex: 1 } }),
    position: "absolute",
    left: 104,
    bottom: 18,
    width: 76,
    height: 10,
    borderRadius: 40,
    backgroundColor: "#0B4A3B",
  },
  satellite: {
    ...Platform.select({ ios: { zIndex: 3 } }),
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2EBEF",
    shadowColor: "#133E64",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  location: { left: 25, top: 72 },
  truck: { right: 21, top: 29 },
  badge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#078354",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    ...Platform.select({ ios: { zIndex: 4 } }),
    position: "absolute",
    left: 65,
    top: 112,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#168E66",
  },
  spark: {
    ...Platform.select({ ios: { zIndex: 4 } }),
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A3D8C3",
  },
});
