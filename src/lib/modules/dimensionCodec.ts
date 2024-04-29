export const getDimensionCodec = (height, useNewFormat) => {
  const oldFormat = {
    type: 'compound',
    name: '',
    value: {
      dimension: {
        type: 'list',
        value: {
          type: 'compound',
          value: [
            {
              name: {
                type: 'string',
                value: 'minecraft:overworld'
              },
              bed_works: {
                type: 'byte',
                value: 1
              },
              shrunk: {
                type: 'byte',
                value: 0
              },
              piglin_safe: {
                type: 'byte',
                value: 0
              },
              has_ceiling: {
                type: 'byte',
                value: 0
              },
              has_skylight: {
                type: 'byte',
                value: 1
              },
              infiniburn: {
                type: 'string',
                value: 'minecraft:infiniburn_overworld'
              },
              ultrawarm: {
                type: 'byte',
                value: 0
              },
              ambient_light: {
                type: 'float',
                value: 0
              },
              logical_height: {
                type: 'int',
                value: 256
              },
              has_raids: {
                type: 'byte',
                value: 1
              },
              natural: {
                type: 'byte',
                value: 1
              },
              respawn_anchor_works: {
                type: 'byte',
                value: 0
              }
            }, /*, minecraft:overworld_caves is not implemented in flying-squid yet            {
              "name": {
                "type": "string",
                "value": "minecraft:overworld_caves"
              },
              "bed_works": {
                "type": "byte",
                "value": 1
              },
              "shrunk": {
                "type": "byte",
                "value": 0
              },
              "piglin_safe": {
                "type": "byte",
                "value": 0
              },
              "has_ceiling": {
                "type": "byte",
                "value": 1
              },
              "has_skylight": {
                "type": "byte",
                "value": 1
              },
              "infiniburn": {
                "type": "string",
                "value": "minecraft:infiniburn_overworld"
              },
              "ultrawarm": {
                "type": "byte",
                "value": 0
              },
              "ambient_light": {
                "type": "float",
                "value": 0
              },
              "logical_height": {
                "type": "int",
                "value": 256
              },
              "has_raids": {
                "type": "byte",
                "value": 1
              },
              "natural": {
                "type": "byte",
                "value": 1
              },
              "respawn_anchor_works": {
                "type": "byte",
                "value": 0
              }
            } */
            {
              infiniburn: {
                type: 'string',
                value: 'minecraft:infiniburn_nether'
              },
              ultrawarm: {
                type: 'byte',
                value: 1
              },
              logical_height: {
                type: 'int',
                value: 128
              },
              natural: {
                type: 'byte',
                value: 0
              },
              name: {
                type: 'string',
                value: 'minecraft:the_nether'
              },
              bed_works: {
                type: 'byte',
                value: 0
              },
              fixed_time: {
                type: 'long',
                value: [
                  0,
                  18000
                ]
              },
              shrunk: {
                type: 'byte',
                value: 1
              },
              piglin_safe: {
                type: 'byte',
                value: 1
              },
              has_skylight: {
                type: 'byte',
                value: 0
              },
              has_ceiling: {
                type: 'byte',
                value: 1
              },
              ambient_light: {
                type: 'float',
                value: 0.1
              },
              has_raids: {
                type: 'byte',
                value: 0
              },
              respawn_anchor_works: {
                type: 'byte',
                value: 1
              }
            }/*, minecraft:the_end is not implemented in flying-squid yet
            {
              "infiniburn": {
                "type": "string",
                "value": "minecraft:infiniburn_end"
              },
              "ultrawarm": {
                "type": "byte",
                "value": 0
              },
              "logical_height": {
                "type": "int",
                "value": 256
              },
              "natural": {
                "type": "byte",
                "value": 0
              },
              "name": {
                "type": "string",
                "value": "minecraft:the_end"
              },
              "bed_works": {
                "type": "byte",
                "value": 0
              },
              "fixed_time": {
                "type": "long",
                "value": [
                  0,
                  6000
                ]
              },
              "shrunk": {
                "type": "byte",
                "value": 0
              },
              "piglin_safe": {
                "type": "byte",
                "value": 0
              },
              "has_skylight": {
                "type": "byte",
                "value": 0
              },
              "has_ceiling": {
                "type": "byte",
                "value": 0
              },
              "ambient_light": {
                "type": "float",
                "value": 0
              },
              "has_raids": {
                "type": "byte",
                "value": 1
              },
              "respawn_anchor_works": {
                "type": "byte",
                "value": 0
              }
            } */
          ]
        }
      }
    }
  }

  const newFormat = {
    "type": "compound",
    "name": "",
    "value": {
      "minecraft:dimension_type": {
        "type": "compound",
        "value": {
          "type": {
            "type": "string",
            "value": "minecraft:dimension_type"
          },
          "value": {
            "type": "list",
            "value": {
              "type": "compound",
              "value": [
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:overworld"
                  },
                  "id": {
                    "type": "int",
                    "value": 0
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "piglin_safe": {
                        "type": "byte",
                        "value": 0
                      },
                      "natural": {
                        "type": "byte",
                        "value": 1
                      },
                      "ambient_light": {
                        "type": "float",
                        "value": 0
                      },
                      "infiniburn": {
                        "type": "string",
                        "value": "#minecraft:infiniburn_overworld"
                      },
                      "respawn_anchor_works": {
                        "type": "byte",
                        "value": 0
                      },
                      "has_skylight": {
                        "type": "byte",
                        "value": 1
                      },
                      "bed_works": {
                        "type": "byte",
                        "value": 1
                      },
                      "effects": {
                        "type": "string",
                        "value": "minecraft:overworld"
                      },
                      "has_raids": {
                        "type": "byte",
                        "value": 1
                      },
                      "logical_height": {
                        "type": "int",
                        "value": 384
                      },
                      "coordinate_scale": {
                        "type": "double",
                        "value": 1
                      },
                      "min_y": {
                        "type": "int",
                        "value": -64
                      },
                      "has_ceiling": {
                        "type": "byte",
                        "value": 0
                      },
                      "ultrawarm": {
                        "type": "byte",
                        "value": 0
                      },
                      "height": {
                        "type": "int",
                        "value": 384
                      }
                    }
                  }
                },
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:the_nether"
                  },
                  "id": {
                    "type": "int",
                    "value": 2
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "piglin_safe": {
                        "type": "byte",
                        "value": 1
                      },
                      "natural": {
                        "type": "byte",
                        "value": 0
                      },
                      "ambient_light": {
                        "type": "float",
                        "value": 0.10000000149011612
                      },
                      "infiniburn": {
                        "type": "string",
                        "value": "#minecraft:infiniburn_nether"
                      },
                      "respawn_anchor_works": {
                        "type": "byte",
                        "value": 1
                      },
                      "has_skylight": {
                        "type": "byte",
                        "value": 0
                      },
                      "bed_works": {
                        "type": "byte",
                        "value": 0
                      },
                      "effects": {
                        "type": "string",
                        "value": "minecraft:the_nether"
                      },
                      "fixed_time": {
                        "type": "long",
                        "value": [
                          0,
                          18000
                        ]
                      },
                      "has_raids": {
                        "type": "byte",
                        "value": 0
                      },
                      "logical_height": {
                        "type": "int",
                        "value": 128
                      },
                      "coordinate_scale": {
                        "type": "double",
                        "value": 8
                      },
                      "min_y": {
                        "type": "int",
                        "value": 0
                      },
                      "has_ceiling": {
                        "type": "byte",
                        "value": 1
                      },
                      "ultrawarm": {
                        "type": "byte",
                        "value": 1
                      },
                      "height": {
                        "type": "int",
                        "value": 256
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      },
      "minecraft:worldgen/biome": {
        "type": "compound",
        "value": {
          "type": {
            "type": "string",
            "value": "minecraft:worldgen/biome"
          },
          "value": {
            "type": "list",
            "value": {
              "type": "compound",
              "value": [
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:the_void"
                  },
                  "id": {
                    "type": "int",
                    "value": 0
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "precipitation": {
                        "type": "string",
                        "value": "none"
                      },
                      "effects": {
                        "type": "compound",
                        "value": {
                          "sky_color": {
                            "type": "int",
                            "value": 8103167
                          },
                          "water_fog_color": {
                            "type": "int",
                            "value": 329011
                          },
                          "fog_color": {
                            "type": "int",
                            "value": 12638463
                          },
                          "water_color": {
                            "type": "int",
                            "value": 4159204
                          },
                          "mood_sound": {
                            "type": "compound",
                            "value": {
                              "tick_delay": {
                                "type": "int",
                                "value": 6000
                              },
                              "offset": {
                                "type": "double",
                                "value": 2
                              },
                              "sound": {
                                "type": "string",
                                "value": "minecraft:ambient.cave"
                              },
                              "block_search_extent": {
                                "type": "int",
                                "value": 8
                              }
                            }
                          }
                        }
                      },
                      "temperature": {
                        "type": "float",
                        "value": 0.5
                      },
                      "downfall": {
                        "type": "float",
                        "value": 0.5
                      },
                      "category": {
                        "type": "string",
                        "value": "none"
                      }
                    }
                  }
                },
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:plains"
                  },
                  "id": {
                    "type": "int",
                    "value": 1
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "precipitation": {
                        "type": "string",
                        "value": "rain"
                      },
                      "effects": {
                        "type": "compound",
                        "value": {
                          "sky_color": {
                            "type": "int",
                            "value": 7907327
                          },
                          "water_fog_color": {
                            "type": "int",
                            "value": 329011
                          },
                          "fog_color": {
                            "type": "int",
                            "value": 12638463
                          },
                          "water_color": {
                            "type": "int",
                            "value": 4159204
                          },
                          "mood_sound": {
                            "type": "compound",
                            "value": {
                              "tick_delay": {
                                "type": "int",
                                "value": 6000
                              },
                              "offset": {
                                "type": "double",
                                "value": 2
                              },
                              "sound": {
                                "type": "string",
                                "value": "minecraft:ambient.cave"
                              },
                              "block_search_extent": {
                                "type": "int",
                                "value": 8
                              }
                            }
                          }
                        }
                      },
                      "temperature": {
                        "type": "float",
                        "value": 0.800000011920929
                      },
                      "downfall": {
                        "type": "float",
                        "value": 0.4000000059604645
                      },
                      "category": {
                        "type": "string",
                        "value": "plains"
                      }
                    }
                  }
                },
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:ocean"
                  },
                  "id": {
                    "type": "int",
                    "value": 42
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "precipitation": {
                        "type": "string",
                        "value": "rain"
                      },
                      "effects": {
                        "type": "compound",
                        "value": {
                          "sky_color": {
                            "type": "int",
                            "value": 8103167
                          },
                          "water_fog_color": {
                            "type": "int",
                            "value": 329011
                          },
                          "fog_color": {
                            "type": "int",
                            "value": 12638463
                          },
                          "water_color": {
                            "type": "int",
                            "value": 4159204
                          },
                          "mood_sound": {
                            "type": "compound",
                            "value": {
                              "tick_delay": {
                                "type": "int",
                                "value": 6000
                              },
                              "offset": {
                                "type": "double",
                                "value": 2
                              },
                              "sound": {
                                "type": "string",
                                "value": "minecraft:ambient.cave"
                              },
                              "block_search_extent": {
                                "type": "int",
                                "value": 8
                              }
                            }
                          }
                        }
                      },
                      "temperature": {
                        "type": "float",
                        "value": 0.5
                      },
                      "downfall": {
                        "type": "float",
                        "value": 0.5
                      },
                      "category": {
                        "type": "string",
                        "value": "ocean"
                      }
                    }
                  }
                },
                {
                  "name": {
                    "type": "string",
                    "value": "minecraft:the_end"
                  },
                  "id": {
                    "type": "int",
                    "value": 56
                  },
                  "element": {
                    "type": "compound",
                    "value": {
                      "precipitation": {
                        "type": "string",
                        "value": "none"
                      },
                      "effects": {
                        "type": "compound",
                        "value": {
                          "sky_color": {
                            "type": "int",
                            "value": 0
                          },
                          "water_fog_color": {
                            "type": "int",
                            "value": 329011
                          },
                          "fog_color": {
                            "type": "int",
                            "value": 10518688
                          },
                          "water_color": {
                            "type": "int",
                            "value": 4159204
                          },
                          "mood_sound": {
                            "type": "compound",
                            "value": {
                              "tick_delay": {
                                "type": "int",
                                "value": 6000
                              },
                              "offset": {
                                "type": "double",
                                "value": 2
                              },
                              "sound": {
                                "type": "string",
                                "value": "minecraft:ambient.cave"
                              },
                              "block_search_extent": {
                                "type": "int",
                                "value": 8
                              }
                            }
                          }
                        }
                      },
                      "temperature": {
                        "type": "float",
                        "value": 0.5
                      },
                      "downfall": {
                        "type": "float",
                        "value": 0.5
                      },
                      "category": {
                        "type": "string",
                        "value": "the_end"
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      }
    }
  }

  return useNewFormat ? newFormat : oldFormat
}

export const dimensionOverworld = {
  "type": "compound",
  "name": "",
  "value": {
    "monster_spawn_light_level": {
      "type": "compound",
      "value": {
        "type": {
          "type": "string",
          "value": "minecraft:uniform"
        },
        "value": {
          "type": "compound",
          "value": {
            "max_inclusive": {
              "type": "int",
              "value": 7
            },
            "min_inclusive": {
              "type": "int",
              "value": 0
            }
          }
        }
      }
    },
    "infiniburn": {
      "type": "string",
      "value": "#minecraft:infiniburn_overworld"
    },
    "effects": {
      "type": "string",
      "value": "minecraft:overworld"
    },
    "ultrawarm": {
      "type": "byte",
      "value": 0
    },
    "height": {
      "type": "int",
      "value": 384
    },
    "logical_height": {
      "type": "int",
      "value": 384
    },
    "natural": {
      "type": "byte",
      "value": 1
    },
    "min_y": {
      "type": "int",
      "value": -64
    },
    "bed_works": {
      "type": "byte",
      "value": 1
    },
    "coordinate_scale": {
      "type": "double",
      "value": 1
    },
    "piglin_safe": {
      "type": "byte",
      "value": 0
    },
    "has_ceiling": {
      "type": "byte",
      "value": 0
    },
    "has_skylight": {
      "type": "byte",
      "value": 1
    },
    "ambient_light": {
      "type": "float",
      "value": 0
    },
    "monster_spawn_block_light_limit": {
      "type": "int",
      "value": 0
    },
    "has_raids": {
      "type": "byte",
      "value": 1
    },
    "respawn_anchor_works": {
      "type": "byte",
      "value": 0
    }
  }
}
