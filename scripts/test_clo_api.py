import sys
import os
import traceback

log_path = "/Volumes/free/Enico Veck/website_enico/scripts/clo_export.log"
with open(log_path, "w") as f:
    f.write("[CLO Test] Script started!\n")
    f.write(f"sys.version: {sys.version}\n")
    f.write("Installed modules containing 'api', 'clo', 'marvelous':\n")
    for m in sorted(sys.modules.keys()):
        if any(k in m.lower() for k in ['api', 'clo', 'marvelous', 'export', 'import', 'types']):
            f.write(f"  {m}\n")
    
    try:
        import import_api
        f.write("import_api dir:\n")
        f.write(str(dir(import_api)) + "\n")
    except Exception as e:
        f.write(f"import_api error: {e}\n")

    try:
        import export_api
        f.write("export_api dir:\n")
        f.write(str(dir(export_api)) + "\n")
    except Exception as e:
        f.write(f"export_api error: {e}\n")

    zprj_path = "/Volumes/free/Enico Veck/1. Tech pack/씨네마/필름.zprj"
    glb_out = "/Volumes/free/Enico Veck/website_enico/public/3d/film.glb"
    obj_out = "/Volumes/free/Enico Veck/website_enico/public/3d/film.obj"
    
    f.write(f"Attempting to import: {zprj_path}\n")
    f.flush()
    try:
        import_api.ImportFile(zprj_path)
        f.write("ImportFile successful!\n")
    except Exception as e:
        f.write(f"ImportFile error: {e}\n{traceback.format_exc()}\n")
    f.flush()

    f.write(f"Attempting to export GLTF: {glb_out}\n")
    f.flush()
    try:
        export_api.ExportGLTF(glb_out, None, True)
        f.write("ExportGLTF (glb_out, None, True) successful!\n")
    except Exception as e:
        f.write(f"ExportGLTF error: {e}\n{traceback.format_exc()}\n")
        try:
            import ApiTypes
            opt = ApiTypes.ImportExportOption()
            f.write(f"ImportExportOption dir: {dir(opt)}\n")
            export_api.ExportGLTF(glb_out, opt, True)
            f.write("ExportGLTF with opt successful!\n")
        except Exception as e2:
            f.write(f"ExportGLTF with opt error: {e2}\n{traceback.format_exc()}\n")
    f.flush()

    f.write(f"Attempting to export OBJ: {obj_out}\n")
    f.flush()
    try:
        export_api.ExportOBJ(obj_out, None)
        f.write("ExportOBJ successful!\n")
    except Exception as e:
        f.write(f"ExportOBJ error: {e}\n{traceback.format_exc()}\n")
    f.flush()

    f.write("[CLO Test] Script finished properly!\n")
