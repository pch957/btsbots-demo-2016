#!/usr/bin/env python3


def id_to_int(id):
    return int(id.split('.')[-1])


def next_id(id):
    id_array = id.split('.')
    id_next = "%s.%s.%d" % (id_array[0], id_array[1], int(id_array[2])+1)
    return id_next
