function createColor(input) {
  let alphaValue = 1
  const api = {
    alpha(value) {
      if (typeof value === 'number') {
        alphaValue = value
        return api
      }
      return alphaValue
    },
    hexa() {
      return String(input)
    },
    hex() {
      return String(input)
    },
    hsl() {
      return {
        hue() {
          return 0
        },
        saturationl() {
          return 100
        },
        lightness() {
          return 50
        }
      }
    },
    rgb() {
      return {
        string() {
          return String(input)
        }
      }
    },
    string() {
      return String(input)
    }
  }
  return api
}

module.exports = createColor
