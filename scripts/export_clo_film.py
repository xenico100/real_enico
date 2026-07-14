import sys
import os

try:
    import import_api
    import export_api
except ImportError as e:
    print("CLO API modules not found. Ensure script is run via CLO -python flag.", e)
    sys.exit(1)

zprj_path = "/Volumes/free/Enico Veck/1. Tech pack/씨네마/필름.zprj"
glb_out = "/Volumes/free/Enico Veck/website_enico/public/3d/film_test.glb"
obj_out = "/Volumes/free/Enico Veck/website_enico/public/3d/film_test.obj"

os.makedirs("/Volumes/free/Enico Veck/website_enico/public/3d", exist_ok=True)

print(f"[CLO Export] Importing project: {zprj_path}")
try:
    import_api.ImportFile(zprj_path)
    print("[CLO Export] Import successful!")
except Exception as e:
    print(f"[CLO Export] Import failed: {e}")

print(f"[CLO Export] Exporting GLB to: {glb_out}")
try:
    export_api.ExportGLTF(glb_out, None, True)
    print("[CLO Export] GLB Export successful!")
except Exception as e:
    print(f"[CLO Export] GLTF Export failed or needs option object: {e}")
    try:
        if 'ApiTypes' in sys.modules or True:
            import ApiTypes
            opt = ApiTypes.ImportExportOption()
            export_api.ExportGLTF(glb_out, opt, True)
            print("[CLO Export] GLB Export with option successful!")
    except Exception as e2:
        print(f"[CLO Export] GLTF Export with option failed: {e2}")

print(f"[CLO Export] Exporting OBJ to: {obj_out}")
try:
    export_api.ExportOBJ(obj_out, None)
    print("[CLO Export] OBJ Export successful!")
except Exception as e:
    print(f"[CLO Export] OBJ Export failed: {e}")
    try:
        import ApiTypes
        opt = ApiTypes.ImportExportOption()
        export_api.ExportOBJ(obj_out, opt)
        print("[CLO Export] OBJ Export with option successful!")
    except Exception as e2:
        print(f"[CLO Export] OBJ Export with option failed: {e2}")

print("[CLO Export] All export attempts finished.")
